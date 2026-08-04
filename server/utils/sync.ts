import type { DealsSnapshot, Offer } from '../../shared/types/offer'
import { mergeCatalog } from './catalog'
import { isLidlXlsxOffer } from './scrapers/lidl'
import { isLidlLeafletOffer } from './scrapers/lidl-leaflet'

interface SourceResult {
  ok: boolean
  offers: Offer[]
  scrapedAt: string | null
  error?: unknown
}

type SourceKey = keyof DealsSnapshot['sources']

interface SourceConfig {
  key: SourceKey
  label: string
  fetch: () => Promise<Offer[]>
  /** Identifies this source's own offers within a previous snapshot, distinguishing it from any other source sharing the same retailer. */
  belongsToSource: (offer: Offer) => boolean
}

export interface RunSyncDeps {
  fetchKauflandOffers: () => Promise<Offer[]>
  fetchLidlOffers: () => Promise<Offer[]>
  fetchLidlLeafletOffers: () => Promise<Offer[]>
  fetchBillaOffers: () => Promise<Offer[]>
  readSnapshot: () => Promise<DealsSnapshot | null>
  writeSnapshot: (snapshot: DealsSnapshot) => Promise<void>
  now?: () => Date
  logError?: (message: string, error: unknown) => void
}

export interface RunSyncResult {
  published: boolean
  reason: 'success' | 'partial' | 'total-failure'
  snapshot: DealsSnapshot | null
}

async function runSource(fetcher: () => Promise<Offer[]>): Promise<SourceResult> {
  try {
    const offers = await fetcher()
    return { ok: true, offers, scrapedAt: offers[0]?.scrapedAt ?? new Date().toISOString() }
  } catch (error) {
    return { ok: false, offers: [], scrapedAt: null, error }
  }
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
    { key: 'lidlLeaflet', label: 'Lidl leaflet', fetch: deps.fetchLidlLeafletOffers, belongsToSource: isLidlLeafletOffer },
    { key: 'billa', label: 'Billa', fetch: deps.fetchBillaOffers, belongsToSource: (o) => o.retailer === 'billa' },
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

  const merged = mergeCatalog(...offersBySource)

  const sourcesBlock = Object.fromEntries(
    sources.map((source, index) => {
      const result = results[index]!
      return [
        source.key,
        { ok: result.ok, scrapedAt: result.ok ? result.scrapedAt : (previous?.sources[source.key]?.scrapedAt ?? null) },
      ]
    }),
  ) as DealsSnapshot['sources']

  const snapshot: DealsSnapshot = {
    offers: merged.offers,
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
