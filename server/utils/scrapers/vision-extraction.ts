import { GoogleGenAI } from '@google/genai'
import { ofetch } from 'ofetch'
import type { LeafletPage } from '../../../shared/types/offer'

export class VisionExtractionError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'VisionExtractionError'
  }
}

export interface PageImageRef {
  pageNumber: number
  imageUrl: string
}

/**
 * A leaflet page's *display* image — deliberately a smaller variant than the
 * one fetched for extraction, since a crop needs far less resolution than OCR.
 */
export interface PageDisplayImage {
  imageUrl: string
  width: number
  height: number
}

export interface FetchedPageImage extends PageImageRef {
  imageBuffer: ArrayBuffer
}

/**
 * Selects one source's entries out of a combined page registry. Page ids are
 * prefixed by source precisely so a source's pages can be carried forward (or
 * left behind) without knowing how the registry was assembled.
 */
export function selectPagesByPrefix(
  pages: Record<string, LeafletPage> | undefined,
  prefix: string,
): Record<string, LeafletPage> {
  return Object.fromEntries(Object.entries(pages ?? {}).filter(([pageId]) => pageId.startsWith(prefix)))
}

/** Fetches every page image, tolerating individual failures per the spec's partial-fetch requirement. */
export async function fetchPageImages(
  refs: PageImageRef[],
): Promise<{ pages: FetchedPageImage[]; skippedPages: number[] }> {
  const results = await Promise.all(
    refs.map(async (ref): Promise<FetchedPageImage | null> => {
      try {
        const imageBuffer = await ofetch(ref.imageUrl, { responseType: 'arrayBuffer' })
        return { ...ref, imageBuffer }
      } catch {
        return null
      }
    }),
  )

  const pages: FetchedPageImage[] = []
  const skippedPages: number[] = []
  results.forEach((result, index) => {
    if (result) pages.push(result)
    else skippedPages.push(refs[index]!.pageNumber)
  })

  return { pages, skippedPages }
}

let visionClient: GoogleGenAI | null = null

export function getVisionClient(): GoogleGenAI {
  if (visionClient) return visionClient

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new VisionExtractionError('GEMINI_API_KEY is not configured')
  }

  visionClient = new GoogleGenAI({ apiKey })
  return visionClient
}

/** Test-only escape hatch so `getVisionClient`'s cache doesn't leak client instances across test cases. */
export function __resetVisionClientForTests(): void {
  visionClient = null
}

/** Runs a Gemini vision call against one image and parses its JSON response into `T`. */
export async function extractStructuredDataFromImage<T>(
  imageBuffer: ArrayBuffer,
  prompt: string,
  responseSchema: object,
  model = 'gemini-3.5-flash-lite',
): Promise<T> {
  const client = getVisionClient()
  const base64Image = Buffer.from(imageBuffer).toString('base64')

  let response: Awaited<ReturnType<typeof client.models.generateContent>>
  try {
    response = await client.models.generateContent({
      model,
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }, { inlineData: { mimeType: 'image/jpeg', data: base64Image } }],
        },
      ],
      config: { responseMimeType: 'application/json', responseSchema },
    })
  } catch (error) {
    throw new VisionExtractionError('Vision extraction request failed', { cause: error })
  }

  const text = response.text
  if (!text) {
    throw new VisionExtractionError('Vision extraction returned an empty response')
  }

  try {
    return JSON.parse(text) as T
  } catch (error) {
    throw new VisionExtractionError('Vision extraction returned invalid JSON', { cause: error })
  }
}

/** Runs a Gemini text-only call and parses its JSON response into `T`; the classification counterpart to `extractStructuredDataFromImage`. */
export async function extractStructuredData<T>(
  prompt: string,
  responseSchema: object,
  model = 'gemini-3.5-flash-lite',
): Promise<T> {
  const client = getVisionClient()

  let response: Awaited<ReturnType<typeof client.models.generateContent>>
  try {
    response = await client.models.generateContent({
      model,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: { responseMimeType: 'application/json', responseSchema },
    })
  } catch (error) {
    throw new VisionExtractionError('Structured data request failed', { cause: error })
  }

  const text = response.text
  if (!text) {
    throw new VisionExtractionError('Structured data request returned an empty response')
  }

  try {
    return JSON.parse(text) as T
  } catch (error) {
    throw new VisionExtractionError('Structured data request returned invalid JSON', { cause: error })
  }
}

export async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let cursor = 0

  async function worker() {
    while (cursor < items.length) {
      const index = cursor++
      results[index] = await fn(items[index]!)
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}
