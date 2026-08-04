import { ofetch } from 'ofetch'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  __resetVisionClientForTests,
  extractStructuredDataFromImage,
  fetchPageImages,
  mapWithConcurrency,
  VisionExtractionError,
} from '../vision-extraction'

vi.mock('ofetch', () => ({ ofetch: vi.fn() }))

const generateContent = vi.fn()

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { generateContent }
  },
}))

describe('fetchPageImages', () => {
  it('returns successfully fetched pages and records the page numbers that failed to fetch', async () => {
    const mockedOfetch = vi.mocked(ofetch)
    mockedOfetch.mockImplementation((url: unknown) => {
      if (typeof url === 'string' && url.includes('page-2')) {
        return Promise.reject(new Error('network error'))
      }
      return Promise.resolve(new ArrayBuffer(8))
    })

    const refs = [
      { pageNumber: 1, imageUrl: 'https://example.com/page-1.jpg' },
      { pageNumber: 2, imageUrl: 'https://example.com/page-2.jpg' },
      { pageNumber: 3, imageUrl: 'https://example.com/page-3.jpg' },
    ]

    const result = await fetchPageImages(refs)

    expect(result.pages.map((p) => p.pageNumber)).toEqual([1, 3])
    expect(result.skippedPages).toEqual([2])
  })
})

describe('mapWithConcurrency', () => {
  it('applies the function to every item and preserves result order', async () => {
    const results = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (n) => n * 10)
    expect(results).toEqual([10, 20, 30, 40, 50])
  })

  it('never runs more than `limit` calls concurrently', async () => {
    let active = 0
    let maxActive = 0

    await mapWithConcurrency([1, 2, 3, 4, 5, 6], 2, async (n) => {
      active++
      maxActive = Math.max(maxActive, active)
      await new Promise((resolve) => setTimeout(resolve, 1))
      active--
      return n
    })

    expect(maxActive).toBeLessThanOrEqual(2)
  })
})

describe('extractStructuredDataFromImage', () => {
  const prompt = 'describe this image'
  const schema = { type: 'OBJECT' }

  beforeEach(() => {
    __resetVisionClientForTests()
    process.env.GEMINI_API_KEY = 'test-key'
    generateContent.mockReset()
  })

  afterEach(() => {
    delete process.env.GEMINI_API_KEY
  })

  it('parses the model response as JSON', async () => {
    generateContent.mockResolvedValue({ text: '{"items":[{"name":"foo"}]}' })

    const result = await extractStructuredDataFromImage<{ items: { name: string }[] }>(
      new ArrayBuffer(8),
      prompt,
      schema,
    )

    expect(result).toEqual({ items: [{ name: 'foo' }] })
  })

  it('throws VisionExtractionError when GEMINI_API_KEY is not configured', async () => {
    delete process.env.GEMINI_API_KEY

    await expect(extractStructuredDataFromImage(new ArrayBuffer(8), prompt, schema)).rejects.toThrow(
      VisionExtractionError,
    )
  })

  it('throws VisionExtractionError when the request fails', async () => {
    generateContent.mockRejectedValue(new Error('network error'))

    await expect(extractStructuredDataFromImage(new ArrayBuffer(8), prompt, schema)).rejects.toThrow(
      VisionExtractionError,
    )
  })

  it('throws VisionExtractionError when the response is empty', async () => {
    generateContent.mockResolvedValue({ text: '' })

    await expect(extractStructuredDataFromImage(new ArrayBuffer(8), prompt, schema)).rejects.toThrow(
      VisionExtractionError,
    )
  })

  it('throws VisionExtractionError when the response is invalid JSON', async () => {
    generateContent.mockResolvedValue({ text: 'not json' })

    await expect(extractStructuredDataFromImage(new ArrayBuffer(8), prompt, schema)).rejects.toThrow(
      VisionExtractionError,
    )
  })
})
