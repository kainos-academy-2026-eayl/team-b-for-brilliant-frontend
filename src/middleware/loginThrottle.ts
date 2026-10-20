const MAX_FAILURES = 5
const LOCK_MS = 15 * 60 * 1000

interface Entry {
  failures: number
  lockedUntil: number
}

export interface LoginThrottle {
  isLocked(keys: string[]): boolean
  recordFailure(keys: string[]): void
  reset(keys: string[]): void
}

export function createLoginThrottle(
  now: () => number = Date.now,
): LoginThrottle {
  const entries = new Map<string, Entry>()

  return {
    isLocked(keys) {
      return keys.some((key) => (entries.get(key)?.lockedUntil ?? 0) > now())
    },
    recordFailure(keys) {
      for (const key of keys) {
        const entry = entries.get(key) ?? { failures: 0, lockedUntil: 0 }
        if (entry.lockedUntil !== 0 && entry.lockedUntil <= now()) {
          entry.failures = 0
          entry.lockedUntil = 0
        }
        entry.failures += 1
        if (entry.failures >= MAX_FAILURES) entry.lockedUntil = now() + LOCK_MS
        entries.set(key, entry)
      }
    },
    reset(keys) {
      for (const key of keys) entries.delete(key)
    },
  }
}
