import { describe, expect, it } from 'vitest'
import { mostRecentSyncWindow } from '../schedule'

describe('mostRecentSyncWindow', () => {
  it('returns today\'s window when checked after 10:00 Kyiv on a sync day (Thursday, summer/EEST)', () => {
    // 2026-08-06 is a Thursday; 11:00 Kyiv (UTC+3) = 08:00 UTC
    const now = new Date('2026-08-06T08:30:00.000Z')
    const window = mostRecentSyncWindow(now)
    expect(window?.toISOString()).toBe('2026-08-06T07:00:00.000Z')
  })

  it('falls back to the previous sync day when checked before 10:00 Kyiv', () => {
    // 2026-08-06 08:00 UTC = 11:00 Kyiv, so use before-window time instead: 06:00 UTC = 09:00 Kyiv
    const now = new Date('2026-08-06T06:00:00.000Z')
    const window = mostRecentSyncWindow(now)
    // previous sync day is Monday 2026-08-03, 10:00 Kyiv (UTC+3) = 07:00 UTC
    expect(window?.toISOString()).toBe('2026-08-03T07:00:00.000Z')
  })

  it('catches up across a gap of several days (e.g. server started on Tuesday)', () => {
    // 2026-08-04 is a Tuesday, well after Monday's window
    const now = new Date('2026-08-04T12:00:00.000Z')
    const window = mostRecentSyncWindow(now)
    expect(window?.toISOString()).toBe('2026-08-03T07:00:00.000Z')
  })

  it('accounts for winter (EET, UTC+2) offset', () => {
    // 2026-01-08 is a Thursday; 10:00 Kyiv (UTC+2) = 08:00 UTC
    const now = new Date('2026-01-08T09:00:00.000Z')
    const window = mostRecentSyncWindow(now)
    expect(window?.toISOString()).toBe('2026-01-08T08:00:00.000Z')
  })
})
