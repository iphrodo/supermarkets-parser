import type { DealsSnapshot, Offer } from '../../shared/types/offer'
import { mergeCatalog } from './catalog'

interface SourceResult {
  ok: boolean
  offers: Offer[]
  scrapedAt: string | null
  error?: unknown
}

export interface RunSyncDeps {
  fetchKauflandOffers: () => Promise<Offer[]>
  fetchLidlOffers: () => Promise<Offer[]>
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
 * Orchestrates one scheduled sync: runs both ingestion jobs, isolates a
 * single source's failure by carrying forward its last known-good offers,
 * and refuses to publish at all when both sources fail (see
 * `deals-snapshot-cache` spec's partial-failure isolation / total-failure
 * guard requirements).
 */
export async function runDailySync(deps: RunSyncDeps): Promise<RunSyncResult> {
  const log = deps.logError ?? ((message: string, error: unknown) => console.error(message, error))
  const now = deps.now ?? (() => new Date())

  const [kaufland, lidl, billa] = await Promise.all([
    runSource(deps.fetchKauflandOffers),
    runSource(deps.fetchLidlOffers),
    runSource(deps.fetchBillaOffers),
  ])

  if (!kaufland.ok) log('Kaufland ingestion failed', kaufland.error)
  if (!lidl.ok) log('Lidl ingestion failed', lidl.error)
  if (!billa.ok) log('Billa ingestion failed', billa.error)

  if (!kaufland.ok && !lidl.ok && !billa.ok) {
    log('All sources failed in the same run; leaving the previously published snapshot untouched', undefined)
    return { published: false, reason: 'total-failure', snapshot: null }
  }

  const previous = await deps.readSnapshot()

  const kauflandOffers = kaufland.ok
    ? kaufland.offers
    : (previous?.offers.filter((offer) => offer.retailer === 'kaufland') ?? [])
  const lidlOffers = lidl.ok ? lidl.offers : (previous?.offers.filter((offer) => offer.retailer === 'lidl') ?? [])
  const billaOffers = billa.ok ? billa.offers : (previous?.offers.filter((offer) => offer.retailer === 'billa') ?? [])

  const merged = mergeCatalog(kauflandOffers, lidlOffers, billaOffers)

  const snapshot: DealsSnapshot = {
    offers: merged.offers,
    generatedAt: now().toISOString(),
    sources: {
      kaufland: {
        ok: kaufland.ok,
        scrapedAt: kaufland.ok ? kaufland.scrapedAt : (previous?.sources.kaufland?.scrapedAt ?? null),
      },
      lidl: {
        ok: lidl.ok,
        scrapedAt: lidl.ok ? lidl.scrapedAt : (previous?.sources.lidl?.scrapedAt ?? null),
      },
      billa: {
        ok: billa.ok,
        scrapedAt: billa.ok ? billa.scrapedAt : (previous?.sources.billa?.scrapedAt ?? null),
      },
    },
  }

  await deps.writeSnapshot(snapshot)

  return {
    published: true,
    reason: kaufland.ok && lidl.ok && billa.ok ? 'success' : 'partial',
    snapshot,
  }
}
