const KYIV_TZ = 'Europe/Kyiv'
const SYNC_WEEKDAYS = new Set(['Mon', 'Thu'])
const SYNC_HOUR = 10

interface KyivParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  weekday: string
}

function getKyivParts(date: Date): KyivParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: KYIV_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    weekday: 'short',
  }).formatToParts(date)

  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? ''

  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')) % 24,
    minute: Number(get('minute')),
    weekday: get('weekday'),
  }
}

function getKyivOffsetMinutes(date: Date): number {
  const offsetPart = new Intl.DateTimeFormat('en-US', {
    timeZone: KYIV_TZ,
    timeZoneName: 'shortOffset',
  })
    .formatToParts(date)
    .find((part) => part.type === 'timeZoneName')?.value

  const match = offsetPart?.match(/GMT([+-]\d+)/)
  return match ? Number(match[1]) * 60 : 120
}

function kyivWallTimeToUtc(year: number, month: number, day: number, hour: number, minute: number): Date {
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute))
  return new Date(guess.getTime() - getKyivOffsetMinutes(guess) * 60_000)
}

/**
 * Finds the most recent Mon/Thu 10:00 Kyiv-time slot that has already
 * elapsed, walking back at most a week. Used to catch up a missed sync
 * when the server is only started intermittently instead of kept running.
 */
export function mostRecentSyncWindow(now: Date = new Date()): Date | null {
  for (let offset = 0; offset < 7; offset++) {
    const probe = getKyivParts(new Date(now.getTime() - offset * 86_400_000))
    if (!SYNC_WEEKDAYS.has(probe.weekday)) continue
    if (offset === 0 && probe.hour < SYNC_HOUR) continue
    return kyivWallTimeToUtc(probe.year, probe.month, probe.day, SYNC_HOUR, 0)
  }
  return null
}
