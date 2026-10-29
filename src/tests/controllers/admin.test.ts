import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../../app'

describe('admin pages', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('serves the admin sign-in page without a logout control', async () => {
    vi.stubEnv('API_BASE_URL', 'http://backend.test')

    const response = await request(createApp()).get('/admin/login')

    expect(response.status).toBe(200)
    expect(response.text).toContain('data-api-base-url="http://backend.test"')
    expect(response.text).not.toContain('logout-button')
    expect(response.text).not.toContain('/static/logout.js')
  })

  it('redirects signed-out visitors from the admin account to sign in', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 401 })),
    )

    const response = await request(createApp()).get('/admin/account')

    expect(response.status).toBe(302)
    expect(response.headers.location).toBe(
      '/admin/login?next=%2Fadmin%2Faccount',
    )
  })

  it('shows the logout button with the API base URL to signed-in admins', async () => {
    vi.stubEnv('API_BASE_URL', 'http://backend.test')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 200 })),
    )

    const response = await request(createApp()).get('/admin/account')

    expect(response.status).toBe(200)
    expect(response.text).toContain(
      'id="logout-button" data-api-base-url="http://backend.test"',
    )
    expect(response.text).toContain('/static/logout.js')
  })
})
