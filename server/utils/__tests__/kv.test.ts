import { describe, expect, it } from 'vitest'
import { readProductTypeVocabulary, readSnapshot, writeProductTypeVocabulary } from '../kv'

/**
 * Every consumer of this module takes its KV access as an injected dependency,
 * so a test reaching the real client has forgotten an injection. Left silent,
 * that is a production write: a stubbed one-entry vocabulary overwriting the
 * real one is exactly how the type vocabulary was once destroyed.
 */
describe('KV client under test', () => {
  it('refuses to open a real connection rather than writing to production', async () => {
    await expect(readSnapshot()).rejects.toThrow(/Refusing to open a real Redis connection/)
    await expect(readProductTypeVocabulary()).rejects.toThrow(/Refusing to open a real Redis connection/)
    await expect(writeProductTypeVocabulary([])).rejects.toThrow(/Refusing to open a real Redis connection/)
  })
})
