const openButton = document.querySelector('#delete-account-open')
const dialog = document.querySelector('#delete-account-dialog')
const passwordForm = document.querySelector('#delete-password-form')
const passwordInput = document.querySelector('#delete-password')
const passwordError = document.querySelector('#delete-password-error')
const confirmForm = document.querySelector('#delete-confirm-form')
const confirmPassword = document.querySelector('#delete-confirm-password')
const cancelButtons = document.querySelectorAll(
  '#delete-password-cancel, #delete-account-cancel',
)

function showPasswordStep() {
  passwordForm.hidden = false
  confirmForm.hidden = true
  passwordInput.value = ''
  confirmPassword.value = ''
  passwordError.hidden = true
  passwordError.textContent = ''
  passwordInput.removeAttribute('aria-invalid')
}

function showError(message) {
  passwordError.textContent = message
  passwordError.hidden = false
  passwordInput.setAttribute('aria-invalid', 'true')
  passwordInput.focus()
}

if (openButton && dialog && passwordForm && confirmForm) {
  openButton.addEventListener('click', () => {
    showPasswordStep()
    dialog.showModal()
    passwordInput.focus()
  })

  dialog.addEventListener('close', showPasswordStep)
  for (const button of cancelButtons) {
    button.addEventListener('click', () => dialog.close())
  }

  passwordForm.addEventListener('submit', async (event) => {
    event.preventDefault()
    if (!passwordInput.value) {
      showError('Enter your password to delete your account.')
      return
    }

    try {
      const response = await fetch(passwordForm.action, {
        method: 'POST',
        body: new URLSearchParams(new FormData(passwordForm)),
        credentials: 'same-origin',
      })

      if (response.status === 204) {
        confirmPassword.value = passwordInput.value
        passwordForm.hidden = true
        confirmForm.hidden = false
        confirmForm.querySelector('button[type="button"]').focus()
        return
      }
      // requireAuth redirects to the sign in page when the session has ended
      if (response.redirected) {
        window.location.reload()
        return
      }

      const body = await response.json().catch(() => ({}))
      showError(body.error ?? 'We could not check your password. Please try again.')
    } catch {
      showError('We could not check your password. Please try again.')
    }
  })
}
