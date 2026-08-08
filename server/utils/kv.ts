import { Redis } from '@upstash/redis'
import type { DealsSnapshot } from '../../shared/types/offer'
import type { UnitBase } from '../../shared/types/comparison'

const SNAPSHOT_KEY = 'deals:snapshot'
const BILLA_PUBLICATION_SLUG_KEY = 'billa:last-publication-slug'
const PRODUCT_TYPE_VOCABULARY_KEY = 'product-types:vocabulary'
const PRODUCT_TYPE_ASSIGNMENTS_KEY = 'product-types:assignments'

export interface ProductType {
  id: string
  labelBg: string
  labelEn: string
  unitBase: UnitBase
}

export type ProductTypeVocabulary = ProductType[]

/** Maps a date-free `productKey` to the `ProductType.id` it was classified as. */
export type ProductTypeAssignments = Record<string, string>

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

export async function readProductTypeVocabulary(): Promise<ProductTypeVocabulary> {
  const redis = getRedisClient()
  const vocabulary = await redis.get<ProductTypeVocabulary>(PRODUCT_TYPE_VOCABULARY_KEY)
  return vocabulary ?? []
}

export async function writeProductTypeVocabulary(vocabulary: ProductTypeVocabulary): Promise<void> {
  const redis = getRedisClient()
  await redis.set(PRODUCT_TYPE_VOCABULARY_KEY, vocabulary)
}

export async function readProductTypeAssignments(): Promise<ProductTypeAssignments> {
  const redis = getRedisClient()
  const assignments = await redis.get<ProductTypeAssignments>(PRODUCT_TYPE_ASSIGNMENTS_KEY)
  return assignments ?? {}
}

export async function writeProductTypeAssignments(assignments: ProductTypeAssignments): Promise<void> {
  const redis = getRedisClient()
  await redis.set(PRODUCT_TYPE_ASSIGNMENTS_KEY, assignments)
}
