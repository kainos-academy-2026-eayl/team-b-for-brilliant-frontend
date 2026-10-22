import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'

const menuScript = readFileSync(
  new URL('../public/menu.js', import.meta.url),
  'utf8',
)

function setupMenu(missingElement?: string) {
  const header = { inert: false }
  const main = { inert: false }
  const focusStates: { headerInert: boolean; mainInert: boolean }[] = []
  const toggle = Object.assign(new EventTarget(), {
    hidden: true,
    setAttribute: vi.fn(),
    focus: vi.fn(() => {
      focusStates.push({ headerInert: header.inert, mainInert: main.inert })
    }),
  })
  const close = Object.assign(new EventTarget(), {
    focus: vi.fn(),
    hidden: true,
  })
  const overlay = Object.assign(new EventTarget(), {
    hidden: true,
    dataset: { open: 'false' },
  })
  const menu = {
    dataset: { open: 'false' },
    querySelectorAll: () => [close],
  }
  const elements = new Map<string, unknown>([
    ['menu-toggle', toggle],
    ['menu-close', close],
    ['menu-overlay', overlay],
    ['site-menu', menu],
  ])
  const document = Object.assign(new EventTarget(), {
    getElementById: (id: string) =>
      id === missingElement ? null : elements.get(id),
    querySelectorAll: () => [header, main],
    body: { classList: { toggle: vi.fn(), add: vi.fn() } },
  })
  runInNewContext(menuScript, { document })

  return { header, main, toggle, close, overlay, menu, document, focusStates }
}

describe('drawer progressive enhancement', () => {
  it('enables drawer styles and controls after successful initialization', () => {
    const state = setupMenu()

    expect(state.document.body.classList.add).toHaveBeenCalledWith(
      'menu-enhanced',
    )
    expect(state.toggle.hidden).toBe(false)
    expect(state.close.hidden).toBe(false)
    expect(state.overlay.hidden).toBe(false)
    expect(state.header.inert).toBe(false)
    expect(state.main.inert).toBe(false)
    expect(state.menu.dataset.open).toBe('false')
  })

  it('leaves fallback navigation in place if initialization cannot complete', () => {
    const state = setupMenu('menu-close')

    expect(state.document.body.classList.add).not.toHaveBeenCalled()
    expect(state.toggle.hidden).toBe(true)
    expect(state.overlay.hidden).toBe(true)
    expect(state.header.inert).toBe(false)
    expect(state.main.inert).toBe(false)
  })
})

describe('drawer background isolation', () => {
  it('makes the header and main inert when opening and focuses the drawer', () => {
    const { header, main, toggle, close, menu } = setupMenu()

    expect(header.inert).toBe(false)
    expect(main.inert).toBe(false)
    toggle.dispatchEvent(new Event('click'))

    expect(header.inert).toBe(true)
    expect(main.inert).toBe(true)
    expect(menu.dataset.open).toBe('true')
    expect(close.focus).toHaveBeenCalledWith({ preventScroll: true })
  })

  it.each(['close button', 'overlay', 'Escape'])(
    'restores the background before returning focus when closed by %s',
    (method) => {
      const state = setupMenu()
      state.toggle.dispatchEvent(new Event('click'))

      if (method === 'close button')
        state.close.dispatchEvent(new Event('click'))
      else if (method === 'overlay')
        state.overlay.dispatchEvent(new Event('click'))
      else
        state.document.dispatchEvent(
          Object.assign(new Event('keydown'), { key: 'Escape' }),
        )

      expect(state.menu.dataset.open).toBe('false')
      expect(state.header.inert).toBe(false)
      expect(state.main.inert).toBe(false)
      expect(state.focusStates).toEqual([
        { headerInert: false, mainInert: false },
      ])
      expect(state.toggle.focus).toHaveBeenCalledWith({ preventScroll: true })
    },
  )

  it('restores pre-existing inert state instead of enabling an already inert region', () => {
    const state = setupMenu()
    state.main.inert = true
    state.toggle.dispatchEvent(new Event('click'))
    state.close.dispatchEvent(new Event('click'))

    expect(state.header.inert).toBe(false)
    expect(state.main.inert).toBe(true)
    expect(state.focusStates).toEqual([{ headerInert: false, mainInert: true }])
  })

  it('captures background state again on each opening', () => {
    const state = setupMenu()
    state.toggle.dispatchEvent(new Event('click'))
    state.close.dispatchEvent(new Event('click'))
    state.main.inert = true
    state.toggle.dispatchEvent(new Event('click'))
    state.close.dispatchEvent(new Event('click'))

    expect(state.focusStates).toEqual([
      { headerInert: false, mainInert: false },
      { headerInert: false, mainInert: true },
    ])
  })
})
