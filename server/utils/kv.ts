import { Redis } from '@upstash/redis'
import type { DealsSnapshot } from '../../shared/types/offer'

const SNAPSHOT_KEY = 'deals:snapshot'
const BILLA_PUBLICATION_SLUG_KEY = 'billa:last-publication-slug'

let client: Redis | null = null

function getRedisClient(): Redis {
  if (client) return client

  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) {
    throw new Error('UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN are not configured')
  }

  client = new Redis({ url, token })
  return client
}

export async function readSnapshot(): Promise<DealsSnapshot | null> {
  const redis = getRedisClient()
  const snapshot = await redis.get<DealsSnapshot>(SNAPSHOT_KEY)
  return snapshot ?? null
}

export async function writeSnapshot(snapshot: DealsSnapshot): Promise<void> {
  const redis = getRedisClient()
  await redis.set(SNAPSHOT_KEY, snapshot)
}

export async function readLastBillaPublicationSlug(): Promise<string | null> {
  const redis = getRedisClient()
  const slug = await redis.get<string>(BILLA_PUBLICATION_SLUG_KEY)
  return slug ?? null
}

export async function writeLastBillaPublicationSlug(slug: string): Promise<void> {
  const redis = getRedisClient()
  await redis.set(BILLA_PUBLICATION_SLUG_KEY, slug)
}
