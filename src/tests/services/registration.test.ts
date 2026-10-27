import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'

const script = readFileSync('public/register.js', 'utf8')

function registrationForm(status = 202, networkFailure = false) {
  const elements = new Map<
    string,
    {
      id: string
      value: string
      textContent: string
      hidden: boolean
      disabled: boolean
      dataset: { apiBaseUrl: string }
      setAttribute: ReturnType<typeof vi.fn>
      removeAttribute: ReturnType<typeof vi.fn>
      addEventListener: ReturnType<typeof vi.fn>
    }
  >()
  for (const id of [
    'register-form',
    'email',
    'password',
    'confirm-password',
    'submit-button',
    'form-error',
    'success-message',
    'email-error',
    'password-error',
    'confirm-password-error',
  ]) {
    elements.set(id, {
      id,
      value: '',
      textContent: '',
      hidden: id === 'success-message',
      disabled: false,
      dataset: { apiBaseUrl: 'http://backend.test' },
      setAttribute: vi.fn(),
      removeAttribute: vi.fn(),
      addEventListener: vi.fn(),
    })
  }
  const element = (id: string) => {
    const result = elements.get(id)
    if (!result) throw new Error(`Missing element ${id}`)
    return result
  }
  element('email').value = ' New@Example.com '
  element('password').value = 'password123'
  element('confirm-password').value = 'password123'
  const fetch = vi.fn(async () => {
    if (networkFailure) throw new Error('Network unavailable')
    return { status, ok: status >= 200 && status < 300 }
  })
  runInNewContext(script, { document: { getElementById: element }, fetch })
  const listener: unknown =
    element('register-form').addEventListener.mock.calls[0]?.[1]
  if (typeof listener !== 'function') throw new Error('Submit listener missing')
  return { element, fetch, submit: () => listener({ preventDefault: vi.fn() }) }
}

describe('registration browser script', () => {
  it.each([8, 1024])(
    'accepts a password of exactly %s characters',
    async (length) => {
      const form = registrationForm()
      const password = 'x'.repeat(length)
      form.element('password').value = password
      form.element('confirm-password').value = password
      await form.submit()
      expect(form.fetch).toHaveBeenCalledOnce()
      expect(form.element('success-message').hidden).toBe(false)
    },
  )

  it('submits only normalized email and password and shows confirmation', async () => {
    const form = registrationForm()
    await form.submit()
    expect(form.fetch).toHaveBeenCalledOnce()
    expect(form.fetch).toHaveBeenCalledWith(
      'http://backend.test/api/v1/auth/register',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          email: 'new@example.com',
          password: 'password123',
        }),
      }),
    )
    expect(form.element('register-form').hidden).toBe(true)
    expect(form.element('success-message').hidden).toBe(false)
  })

  it.each([400, 429, 500])(
    'shows an error and allows retry for HTTP %s',
    async (status) => {
      const form = registrationForm(status)
      await form.submit()
      expect(form.element('form-error').textContent).not.toBe('')
      expect(form.element('submit-button').disabled).toBe(false)
      expect(form.element('register-form').hidden).toBe(false)
      expect(form.element('success-message').hidden).toBe(true)
    },
  )

  it('shows an error and allows retry on network failure', async () => {
    const form = registrationForm(202, true)
    await form.submit()
    expect(form.element('form-error').textContent).toContain(
      'Something went wrong',
    )
    expect(form.element('submit-button').disabled).toBe(false)
    expect(form.element('success-message').hidden).toBe(true)
  })

  it.each(['short', 'x'.repeat(1025)])(
    'rejects passwords outside backend limits',
    async (password) => {
      const form = registrationForm()
      form.element('password').value = password
      form.element('confirm-password').value = password
      await form.submit()
      expect(form.fetch).not.toHaveBeenCalled()
      expect(form.element('password-error').textContent).not.toBe('')
    },
  )

  it('rejects mismatched confirmation', async () => {
    const form = registrationForm()
    form.element('confirm-password').value = 'different'
    await form.submit()
    expect(form.fetch).not.toHaveBeenCalled()
    expect(form.element('confirm-password-error').textContent).toBe(
      'Passwords do not match',
    )
  })
})
