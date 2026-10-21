const MAX_FAILURES = 5
const LOCK_MS = 15 * 60 * 1000
const CLEANUP_INTERVAL_MS = 60 * 1000
const MAX_ENTRIES = 10_000

interface Entry {
  failures: number
  lockedUntil: number
  lastFailureAt: number
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
  let lastCleanupAt = 0

  function cleanup(currentTime: number) {
    if (currentTime - lastCleanupAt < CLEANUP_INTERVAL_MS) return
    lastCleanupAt = currentTime

    for (const [key, entry] of entries) {
      const expiredLock =
        entry.lockedUntil !== 0 && entry.lockedUntil <= currentTime
      const expiredFailures =
        entry.lockedUntil === 0 &&
        entry.lastFailureAt + LOCK_MS <= currentTime
      if (expiredLock || expiredFailures) entries.delete(key)
    }
  }

  return {
    isLocked(keys) {
      const currentTime = now()
      cleanup(currentTime)
      return keys.some(
        (key) => (entries.get(key)?.lockedUntil ?? 0) > currentTime,
      )
    },
    recordFailure(keys) {
      const currentTime = now()
      cleanup(currentTime)

      for (const key of keys) {
        let entry = entries.get(key)
        if (
          entry &&
          ((entry.lockedUntil !== 0 && entry.lockedUntil <= currentTime) ||
            (entry.lockedUntil === 0 &&
              entry.lastFailureAt + LOCK_MS <= currentTime))
        ) {
          entries.delete(key)
          entry = undefined
        }
        if (!entry && entries.size >= MAX_ENTRIES) continue
        entry ??= { failures: 0, lockedUntil: 0, lastFailureAt: currentTime }
        entry.failures += 1
        entry.lastFailureAt = currentTime
        if (entry.failures >= MAX_FAILURES) {
          entry.lockedUntil = currentTime + LOCK_MS
        }
        entries.set(key, entry)
      }
    },
    reset(keys) {
      cleanup(now())
      for (const key of keys) entries.delete(key)
    },
  }
}
