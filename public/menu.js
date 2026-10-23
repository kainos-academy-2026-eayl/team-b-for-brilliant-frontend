const toggle = document.querySelector('#menu-toggle')
const menu = document.querySelector('#site-menu')
const close = document.querySelector('#menu-close')
const overlay = document.querySelector('#menu-overlay')
const header = document.querySelector('.site-header')
const main = document.querySelector('main')

if (toggle && menu && close && overlay && header && main) {
  let isOpen = false
  const background = [header, main]
  let previousInert = []

  function setOpen(open) {
    if (open === isOpen) return
    if (open) previousInert = background.map((element) => element.inert)
    isOpen = open
    menu.dataset.open = String(open)
    overlay.dataset.open = String(open)
    toggle.setAttribute('aria-expanded', String(open))
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu')
    document.body.classList.toggle('menu-open', open)
    menu.inert = !open
    background.forEach((element, index) => {
      element.inert = open || previousInert[index]
    })

    if (open) {
      close.focus()
    } else {
      toggle.focus()
    }
  }

  menu.inert = true
  menu.setAttribute('role', 'dialog')
  menu.setAttribute('aria-modal', 'true')
  document.body.classList.add('menu-enhanced')
  toggle.hidden = false
  close.hidden = false
  overlay.hidden = false

  toggle.addEventListener('click', () => setOpen(!isOpen))
  close.addEventListener('click', () => setOpen(false))
  overlay.addEventListener('click', () => setOpen(false))

  menu.addEventListener('click', (event) => {
    if (event.target instanceof Element && event.target.closest('a[href]')) {
      setOpen(false)
    }
  })

  document.addEventListener('keydown', (event) => {
    if (!isOpen) return

    if (event.key === 'Escape') {
      event.preventDefault()
      setOpen(false)
    } else if (event.key === 'Tab') {
      const controls = [...menu.querySelectorAll('a[href], button:not(:disabled)')]
      const first = controls[0]
      const last = controls.at(-1)

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }
  })
}
