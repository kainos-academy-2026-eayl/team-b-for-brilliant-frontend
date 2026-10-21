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

  it('expires partial failures after the lock window', () => {
    let time = 0
    const throttle = createLoginThrottle(() => time)
    const keys = ['email:a@b.com']

    for (let i = 0; i < 4; i++) throttle.recordFailure(keys)
    time += 15 * 60 * 1000 + 1
    throttle.recordFailure(keys)

    expect(throttle.isLocked(keys)).toBe(false)
  })

  it('does not evict active lockouts when storage reaches its limit', () => {
    let time = 0
    const throttle = createLoginThrottle(() => time)
    const keys = Array.from({ length: 10_000 }, (_, i) => `email:${i}`)

    for (let i = 0; i < 5; i++) throttle.recordFailure(keys)
    throttle.recordFailure(['email:new'])

    expect(throttle.isLocked(['email:0', 'email:9999'])).toBe(true)
    expect(throttle.isLocked(['email:new'])).toBe(false)

    time += 15 * 60 * 1000 + 1
    for (let i = 0; i < 5; i++) throttle.recordFailure(['email:new'])
    expect(throttle.isLocked(['email:new'])).toBe(true)
  })
})
