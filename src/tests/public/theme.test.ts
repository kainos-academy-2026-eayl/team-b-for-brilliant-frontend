import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'

const script = readFileSync('public/theme.js', 'utf8')

function loadTheme(savedTheme?: string, storageUnavailable = false) {
  const storage = new Map<string, string>()
  if (savedTheme !== undefined) storage.set('b-brilliant-theme', savedTheme)
  const dataset: Record<string, string> = {}
  const attributes = new Map<string, string>()
  const listeners = new Map<string, () => void>()
  const control = { hidden: true }
  const toggle = {
    setAttribute: (name: string, value: string) => attributes.set(name, value),
    addEventListener: (name: string, handler: () => void) =>
      listeners.set(name, handler),
  }
  const warn = vi.fn()

  runInNewContext(script, {
    document: {
      documentElement: { dataset },
      querySelector: (selector: string) =>
        selector === '#theme-control' ? control : toggle,
      addEventListener: (name: string, handler: () => void) =>
        listeners.set(name, handler),
    },
    localStorage: {
      getItem: (key: string) => {
        if (storageUnavailable) throw new Error('Storage blocked')
        return storage.get(key) ?? null
      },
      setItem: (key: string, value: string) => {
        if (storageUnavailable) throw new Error('Storage blocked')
        storage.set(key, value)
      },
    },
    console: { warn },
  })

  return { dataset, attributes, listeners, control, storage, warn }
}

describe('shared theme', () => {
  it('defaults to light mode and only reveals the control after initialization', () => {
    const page = loadTheme()
    expect(page.dataset.theme).toBe('light')
    expect(page.control.hidden).toBe(true)

    page.listeners.get('DOMContentLoaded')?.()
    expect(page.attributes.get('aria-checked')).toBe('false')
    expect(page.control.hidden).toBe(false)
  })

  it('restores dark mode before the controls initialize', () => {
    const page = loadTheme('dark')
    expect(page.dataset.theme).toBe('dark')

    page.listeners.get('DOMContentLoaded')?.()
    expect(page.attributes.get('aria-checked')).toBe('true')
  })

  it('switches in both directions and persists the choice for subsequent pages', () => {
    const page = loadTheme()
    page.listeners.get('DOMContentLoaded')?.()
    page.listeners.get('click')?.()
    expect(page.dataset.theme).toBe('dark')
    expect(page.attributes.get('aria-checked')).toBe('true')
    expect(page.storage.get('b-brilliant-theme')).toBe('dark')
    expect(loadTheme(page.storage.get('b-brilliant-theme')).dataset.theme).toBe('dark')

    page.listeners.get('click')?.()
    expect(page.dataset.theme).toBe('light')
    expect(page.attributes.get('aria-checked')).toBe('false')
    expect(page.storage.get('b-brilliant-theme')).toBe('light')
  })

  it('ignores an invalid saved theme', () => {
    expect(loadTheme('invalid').dataset.theme).toBe('light')
  })

  it('still switches when storage is blocked and reports persistence failures', () => {
    const page = loadTheme(undefined, true)
    expect(page.warn).toHaveBeenCalledTimes(1)
    page.listeners.get('DOMContentLoaded')?.()
    page.listeners.get('click')?.()
    expect(page.dataset.theme).toBe('dark')
    expect(page.attributes.get('aria-checked')).toBe('true')
    expect(page.warn).toHaveBeenCalledTimes(2)
    expect(page.warn.mock.calls[1]?.[0]).toContain('only apply to this page')
  })
})
