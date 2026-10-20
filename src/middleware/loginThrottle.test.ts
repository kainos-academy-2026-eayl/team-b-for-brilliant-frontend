import { describe, expect, it } from 'vitest'
import { createLoginThrottle } from './loginThrottle'

describe('loginThrottle', () => {
  it('locks after 5 failures and unlocks after the window', () => {
    let time = 0
    const throttle = createLoginThrottle(() => time)
    const keys = ['email:a@b.com']

    for (let i = 0; i < 4; i++) throttle.recordFailure(keys)
    expect(throttle.isLocked(keys)).toBe(false)

    throttle.recordFailure(keys)
    expect(throttle.isLocked(keys)).toBe(true)

    time += 15 * 60 * 1000 + 1
    expect(throttle.isLocked(keys)).toBe(false)
  })

  it('resets on success', () => {
    const throttle = createLoginThrottle()
    const keys = ['email:a@b.com']
    for (let i = 0; i < 4; i++) throttle.recordFailure(keys)
    throttle.reset(keys)
    throttle.recordFailure(keys)
    expect(throttle.isLocked(keys)).toBe(false)
  })
})
