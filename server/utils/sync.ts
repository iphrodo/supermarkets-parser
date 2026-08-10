import type { ComparisonGroup } from '../../shared/types/comparison'
import { CATCH_ALL_DEPARTMENT, type DepartmentId } from '../../shared/types/department'
import type { DealsSnapshot, LeafletPage, Offer } from '../../shared/types/offer'
import { mergeCatalog } from './catalog'
import { buildComparisons, createDepartmentResolver } from './comparison'
import type { ProductTypeAssignments, ProductTypeVocabulary } from './kv'
import { classifyOffers as classifyOffersImpl, defaultClassifyOffersDeps } from './product-type'
import { backfillDepartments as backfillDepartmentsImpl, defaultBackfillDepartmentsDeps } from './product-type-department'
import { defaultMergeDuplicateTypesDeps, mergeAndPersistDuplicateTypes } from './product-type-merge'
import { BILLA_PAGE_ID_PREFIX } from './scrapers/billa'
import { isLidlXlsxOffer } from './scrapers/lidl'
import { isLidlSiteOffer } from './scrapers/lidl-site'
import { selectPagesByPrefix } from './scrapers/vision-extraction'

export interface ClassifiedTypes {
  vocabulary: ProductTypeVocabulary
  assignments: ProductTypeAssignments
}

/** Leaflet sources also publish the pages their offers' crops reference; the others omit it. */
export interface SourceIngestResult {
  offers: Offer[]
  leafletPages?: Record<string, LeafletPage>
}

interface SourceResult {
  ok: boolean
  offers: Offer[]
  leafletPages: Record<string, LeafletPage>
  scrapedAt: string | null
  error?: unknown
}

type SourceKey = keyof DealsSnapshot['sources']

interface SourceConfig {
  key: SourceKey
  label: string
  fetch: () => Promise<SourceIngestResult>
  /** Identifies this source's own offers within a previous snapshot, distinguishing it from any other source sharing the same retailer. */
  belongsToSource: (offer: Offer) => boolean
  /** Key prefix identifying this source's own pages in a previous snapshot's registry; absent for sources without leaflet pages. */
  pageIdPrefix?: string
}

export interface RunSyncDeps {
  fetchKauflandOffers: () => Promise<SourceIngestResult>
  fetchLidlOffers: () => Promise<SourceIngestResult>
  fetchLidlSiteOffers: () => Promise<SourceIngestResult>
  fetchBillaOffers: () => Promise<SourceIngestResult>
  fetchBulmagOffers: () => Promise<SourceIngestResult>
  readSnapshot: () => Promise<DealsSnapshot | null>
  writeSnapshot: (snapshot: DealsSnapshot) => Promise<void>
  /** Injectable so tests never touch the network; defaults to the real model-backed classifier. */
  classifyOffers?: (offers: Offer[]) => Promise<ClassifiedTypes>
  /** Same, for the vocabulary-level department backfill that runs between classification and comparison building. */
  backfillDepartments?: (vocabulary: ProductTypeVocabulary) => Promise<ProductTypeVocabulary>
  /** Same, for the duplicate-type merge that runs just before the backfill. */
  mergeDuplicateTypes?: (
    vocabulary: ProductTypeVocabulary,
    assignments: ProductTypeAssignments,
  ) => Promise<ClassifiedTypes>
  now?: () => Date
  logError?: (message: string, error: unknown) => void
}

export interface RunSyncResult {
  published: boolean
  reason: 'success' | 'partial' | 'total-failure'
  snapshot: DealsSnapshot | null
}

async function runSource(fetcher: () => Promise<SourceIngestResult>): Promise<SourceResult> {
  try {
    const { offers, leafletPages } = await fetcher()
    return {
      ok: true,
      offers,
      leafletPages: leafletPages ?? {},
      scrapedAt: offers[0]?.scrapedAt ?? new Date().toISOString(),
    }
  } catch (error) {
    return { ok: false, offers: [], leafletPages: {}, scrapedAt: null, error }
  }
}

/**
 * Keeps only the pages a surviving offer's crop actually points at. Without
 * this, one superseded leaflet's pages would accumulate in the snapshot every
 * week, and a carried-forward source would drag its whole registry along.
 */
function pruneUnreferencedPages(
  pages: Record<string, LeafletPage>,
  offers: Offer[],
): Record<string, LeafletPage> {
  const referenced = new Set(offers.map((offer) => offer.imageCrop?.pageId).filter((id): id is string => Boolean(id)))
  return Object.fromEntries(Object.entries(pages).filter(([pageId]) => referenced.has(pageId)))
}

/**
 * A snapshot published before a source was added, removed, or renamed carries
 * no status for it. That is a source change, not a corrupt snapshot, so it
 * reads as "no last known-good data" rather than throwing and taking the
 * remaining sources' carry-forward down with it.
 */
function previousSourceStatus(
  previous: DealsSnapshot | null,
  key: SourceKey,
): { scrapedAt: string | null; ok: boolean } {
  return previous?.sources?.[key] ?? { scrapedAt: null, ok: false }
}

/** Departments already resolved for a previous run's offers, keyed by `offerKey` — the degrade-on-failure fallback. */
function previousDepartmentsByOfferKey(previous: DealsSnapshot | null): Map<string, DepartmentId> {
  const map = new Map<string, DepartmentId>()
  for (const offer of previous?.offers ?? []) {
    if (offer.department) map.set(offer.offerKey, offer.department)
  }
  return map
}

/**
 * Orchestrates one scheduled sync: runs every source's ingestion, isolates
 * each source's failure by carrying forward its own last known-good offers
 * (distinguished from any other source sharing the same retailer via
 * `belongsToSource`), and refuses to publish at all when every source fails
 * (see `deals-snapshot-cache` spec's partial-failure isolation / total-failure
 * guard requirements).
 */
export async function runDailySync(deps: RunSyncDeps): Promise<RunSyncResult> {
  const log = deps.logError ?? ((message: string, error: unknown) => console.error(message, error))
  const now = deps.now ?? (() => new Date())

  const sources: SourceConfig[] = [
    { key: 'kaufland', label: 'Kaufland', fetch: deps.fetchKauflandOffers, belongsToSource: (o) => o.retailer === 'kaufland' },
    { key: 'lidl', label: 'Lidl', fetch: deps.fetchLidlOffers, belongsToSource: isLidlXlsxOffer },
    { key: 'lidlSite', label: 'Lidl site', fetch: deps.fetchLidlSiteOffers, belongsToSource: isLidlSiteOffer },
    {
      key: 'billa',
      label: 'Billa',
      fetch: deps.fetchBillaOffers,
      belongsToSource: (o) => o.retailer === 'billa',
      pageIdPrefix: BILLA_PAGE_ID_PREFIX,
    },
    { key: 'bulmag', label: 'Bulmag', fetch: deps.fetchBulmagOffers, belongsToSource: (o) => o.retailer === 'bulmag' },
  ]

  const results = await Promise.all(sources.map((source) => runSource(source.fetch)))

  results.forEach((result, index) => {
    if (!result.ok) log(`${sources[index]!.label} ingestion failed`, result.error)
  })

  if (results.every((result) => !result.ok)) {
    log('All sources failed in the same run; leaving the previously published snapshot untouched', undefined)
    return { published: false, reason: 'total-failure', snapshot: null }
  }

  const previous = await deps.readSnapshot()

  const offersBySource = sources.map((source, index) => {
    const result = results[index]!
    return result.ok ? result.offers : (previous?.offers.filter(source.belongsToSource) ?? [])
  })

  // A carried-forward offer's crop points at a page published alongside it, so
  // the pages come forward too — but only the failed source's, never the pages
  // a succeeding source has already superseded.
  const pagesBySource = sources.map((source, index) => {
    const result = results[index]!
    if (result.ok) return result.leafletPages
    if (!source.pageIdPrefix) return {}
    return selectPagesByPrefix(previous?.leafletPages, source.pageIdPrefix)
  })

  const merged = mergeCatalog(...offersBySource)
  const leafletPages = pruneUnreferencedPages(Object.assign({}, ...pagesBySource), merged.offers)

  const classify = deps.classifyOffers ?? ((offers) => classifyOffersImpl(offers, defaultClassifyOffersDeps()))
  const backfill =
    deps.backfillDepartments ?? ((vocabulary) => backfillDepartmentsImpl(vocabulary, defaultBackfillDepartmentsDeps()))
  const dedupe =
    deps.mergeDuplicateTypes ??
    ((vocabulary, assignments) =>
      mergeAndPersistDuplicateTypes(vocabulary, assignments, defaultMergeDuplicateTypesDeps()))

  let comparisons: ComparisonGroup[]
  let offers: Offer[]
  try {
    const classified = await classify(merged.offers)
    // Inside the same guard as classification: a failure here must degrade to
    // the previously published comparisons, never block publication.
    //
    // Deduplicating first means the backfill never spends a model call on a
    // type that is about to be merged away.
    const deduped = await dedupe(classified.vocabulary, classified.assignments)
    const withDepartments = await backfill(deduped.vocabulary)
    const resolveDepartment = createDepartmentResolver(withDepartments, deduped.assignments)
    comparisons = buildComparisons(merged.offers, withDepartments, deduped.assignments)
    offers = merged.offers.map((offer) => ({ ...offer, department: resolveDepartment.forProductKey(offer.productKey) }))
  } catch (error) {
    log('Comparison enrichment failed; publishing with the previous snapshot’s comparisons', error)
    comparisons = previous?.comparisons ?? []
    const previousDepartments = previousDepartmentsByOfferKey(previous)
    offers = merged.offers.map((offer) => ({
      ...offer,
      department: previousDepartments.get(offer.offerKey) ?? CATCH_ALL_DEPARTMENT,
    }))
  }

  const sourcesBlock = Object.fromEntries(
    sources.map((source, index) => {
      const result = results[index]!
      return [
        source.key,
        { ok: result.ok, scrapedAt: result.ok ? result.scrapedAt : previousSourceStatus(previous, source.key).scrapedAt },
      ]
    }),
  ) as DealsSnapshot['sources']

  const snapshot: DealsSnapshot = {
    offers,
    comparisons,
    leafletPages,
    generatedAt: now().toISOString(),
    sources: sourcesBlock,
  }

  await deps.writeSnapshot(snapshot)

  return {
    published: true,
    reason: results.every((result) => result.ok) ? 'success' : 'partial',
    snapshot,
  }
}
