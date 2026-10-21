import { describe, expect, it } from 'vitest'
import { safeRedirect } from './safeRedirect'

describe('safeRedirect', () => {
  it('allows local paths', () => {
    expect(safeRedirect('/orders?page=2')).toBe('/orders?page=2')
  })

  it('rejects absolute URLs', () => {
    expect(safeRedirect('https://evil.com')).toBe('/account')
  })

  it('rejects protocol-relative URLs', () => {
    expect(safeRedirect('//evil.com')).toBe('/account')
  })

  it('falls back when missing', () => {
    expect(safeRedirect(undefined)).toBe('/account')
  })
})
