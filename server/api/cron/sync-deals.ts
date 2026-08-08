import { readSnapshot, writeSnapshot } from '../../utils/kv'
import { fetchBillaOffers } from '../../utils/scrapers/billa'
import { fetchKauflandOffers } from '../../utils/scrapers/kaufland'
import { fetchLidlOffers } from '../../utils/scrapers/lidl'
import { fetchLidlLeafletOffers } from '../../utils/scrapers/lidl-leaflet'
import { runDailySync } from '../../utils/sync'

/**
 * Triggered by Vercel Cron (daily, UTC). Not reachable without the shared
 * secret, so no page request can ever cause a live scrape.
 */
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const authHeader = getHeader(event, 'authorization')

  if (!config.cronSecret || authHeader !== `Bearer ${config.cronSecret}`) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const result = await runDailySync({
    // Neither Kaufland nor the Lidl price list has leaflet pages to publish.
    fetchKauflandOffers: async () => ({ offers: await fetchKauflandOffers() }),
    fetchLidlOffers: async () => ({ offers: await fetchLidlOffers() }),
    fetchLidlLeafletOffers,
    fetchBillaOffers,
    readSnapshot,
    writeSnapshot,
  })

  if (result.reason === 'total-failure') {
    setResponseStatus(event, 502)
  }

  return {
    published: result.published,
    reason: result.reason,
    offerCount: result.snapshot?.offers.length ?? null,
  }
})
