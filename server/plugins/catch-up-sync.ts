import { readSnapshot, writeSnapshot } from '../utils/kv'
import { mostRecentSyncWindow } from '../utils/schedule'
import { fetchBillaOffers } from '../utils/scrapers/billa'
import { fetchKauflandOffers } from '../utils/scrapers/kaufland'
import { fetchLidlOffers } from '../utils/scrapers/lidl'
import { runDailySync } from '../utils/sync'

/**
 * The server isn't kept running between the Mon/Thu 10:00 Kyiv sync
 * windows, so on every boot we check whether the most recent window was
 * missed and, if so, run the sync immediately instead of waiting for it.
 */
export default defineNitroPlugin(() => {
  runCatchUpSync().catch((error) => console.error('Catch-up sync failed', error))
})

async function runCatchUpSync() {
  const window = mostRecentSyncWindow()
  if (!window) return

  const snapshot = await readSnapshot()
  const lastSyncAt = snapshot?.generatedAt ? new Date(snapshot.generatedAt) : null
  if (lastSyncAt && lastSyncAt >= window) return

  console.log(`Running catch-up sync for missed window ${window.toISOString()}`)
  await runDailySync({
    fetchKauflandOffers,
    fetchLidlOffers,
    fetchBillaOffers,
    readSnapshot,
    writeSnapshot,
  })
}
