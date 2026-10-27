import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createApp } from '../../app'

describe('registration page', () => {
  it('serves registration with a working script and sign-in link', async () => {
    const app = createApp()
    const page = await request(app).get('/register').expect(200)
    expect(page.text).toContain('src="/static/register.js"')
    expect(page.text).toContain('Registration request processed.')
    expect(page.text).toContain('href="/login"')
    expect(page.text).not.toContain('Check your email')
    const script = await request(app).get('/static/register.js').expect(200)
    expect(script.headers['content-type']).toContain('javascript')
    expect(script.text).toContain('/api/v1/auth/register')
  })

  it('does not expose email-verification or MFA pages', async () => {
    const app = createApp()
    await request(app).get('/verify-email?token=old').expect(404)
    await request(app).get('/login/mfa').expect(404)
    await request(app).get('/static/verify-email.ts').expect(404)
  })
})
