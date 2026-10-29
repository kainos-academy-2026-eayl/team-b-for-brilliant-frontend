(() => {
  const storageKey = 'b-brilliant-theme'
  let theme = 'light'

  try {
    if (localStorage.getItem(storageKey) === 'dark') theme = 'dark'
  } catch (error) {
    console.warn('Could not read the saved colour theme.', error)
  }

  document.documentElement.dataset.theme = theme

  document.addEventListener('DOMContentLoaded', () => {
    const control = document.querySelector('#theme-control')
    const toggle = document.querySelector('#theme-switch')
    if (!control || !toggle) return

    toggle.setAttribute('aria-checked', String(theme === 'dark'))
    control.hidden = false

    toggle.addEventListener('click', () => {
      theme = theme === 'dark' ? 'light' : 'dark'
      document.documentElement.dataset.theme = theme
      toggle.setAttribute('aria-checked', String(theme === 'dark'))

      try {
        localStorage.setItem(storageKey, theme)
      } catch (error) {
        console.warn('Could not save the colour theme. It will only apply to this page.', error)
      }
    })
  })
})()
