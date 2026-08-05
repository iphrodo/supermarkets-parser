import type { DealsSnapshot } from '../../shared/types/offer'
import { readSnapshot } from '../utils/kv'

const EMPTY_SNAPSHOT: DealsSnapshot = {
  offers: [],
  comparisons: [],
  generatedAt: '',
  sources: {
    kaufland: { ok: false, scrapedAt: null },
    lidl: { ok: false, scrapedAt: null },
    lidlLeaflet: { ok: false, scrapedAt: null },
    billa: { ok: false, scrapedAt: null },
  },
}

/**
 * Always reads the last published snapshot — never triggers a scrape, so a
 * stale cache window degrades to old data, not an error (per
 * `deals-browsing-ui` spec's ISR requirement).
 */
export default defineEventHandler(async (): Promise<DealsSnapshot> => {
  try {
    const snapshot = await readSnapshot()
    return snapshot ?? EMPTY_SNAPSHOT
  } catch (error) {
    console.error('Failed to read deals snapshot from KV', error)
    return EMPTY_SNAPSHOT
  }
})
