(() => {
  const toggle = document.getElementById('menu-toggle')
  const menu = document.getElementById('site-menu')
  const overlay = document.getElementById('menu-overlay')
  const close = document.getElementById('menu-close')
  if (!toggle || !menu || !overlay || !close) return
  const backgroundRegions = Array.from(
    document.querySelectorAll('.site-header, main'),
    (element) => ({ element, wasInert: element.inert }),
  )

  const focusable = () =>
    Array.from(menu.querySelectorAll('a[href], button:not([disabled])'))

  function setOpen(open) {
    menu.dataset.open = String(open)
    overlay.dataset.open = String(open)
    toggle.setAttribute('aria-expanded', String(open))
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu')
    document.body.classList.toggle('menu-open', open)
    for (const region of backgroundRegions) {
      if (open) region.wasInert = region.element.inert
      region.element.inert = open || region.wasInert
    }
    if (open) focusable()[0]?.focus({ preventScroll: true })
    else toggle.focus({ preventScroll: true })
  }

  const isOpen = () => menu.dataset.open === 'true'

  toggle.addEventListener('click', () => setOpen(!isOpen()))
  close.addEventListener('click', () => setOpen(false))
  overlay.addEventListener('click', () => setOpen(false))

  document.addEventListener('keydown', (event) => {
    if (!isOpen()) return
    if (event.key === 'Escape') {
      setOpen(false)
      return
    }
    if (event.key !== 'Tab') return
    const items = focusable()
    const first = items[0]
    const last = items[items.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  })

  document.body.classList.add('menu-enhanced')
  toggle.hidden = false
  close.hidden = false
  overlay.hidden = false
})()
