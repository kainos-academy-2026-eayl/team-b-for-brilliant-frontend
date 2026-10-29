import request from 'supertest'
import nunjucks from 'nunjucks'
import { describe, expect, it } from 'vitest'
import { createApp } from '../../app'

describe('shared navigation', () => {
  it('renders one menu with a single shop label and loads the drawer script', async () => {
    const response = await request(createApp()).get('/login')

    expect(response.status).toBe(200)
    expect(response.text.match(/<header\b/g)).toHaveLength(1)
    expect(response.text.match(/id="site-menu"/g)).toHaveLength(1)
    expect(response.text).toContain('aria-controls="site-menu"')
    expect(response.text).toContain('href="/home">Home</a>')
    expect(response.text).toContain('Shop all products</a>')
    expect(response.text).not.toContain('site-menu__hint')
    expect(response.text).toContain('href="/register"')
    expect(response.text).not.toContain('action="/logout"')
    expect(response.text).toContain('src="/static/menu.js"')
    expect(response.text.match(/id="theme-switch"/g)).toHaveLength(1)
    expect(response.text).toContain('role="switch" aria-checked="false" aria-labelledby="theme-label"')
    expect(response.text).toContain('id="theme-label">Dark mode</span>')
    expect(response.text.indexOf('src="/static/theme.js"')).toBeLessThan(
      response.text.indexOf('href="/static/styles.css"'),
    )
  })

  it('serves the drawer script from the shared static path', async () => {
    const response = await request(createApp()).get('/static/menu.js')

    expect(response.status).toBe(200)
    expect(response.headers['content-type']).toContain('javascript')
    expect(response.text).toContain("toggle.addEventListener('click'")
  })

  it('serves the shared theme script', async () => {
    const response = await request(createApp()).get('/static/theme.js')

    expect(response.status).toBe(200)
    expect(response.headers['content-type']).toContain('javascript')
    expect(response.text).toContain('b-brilliant-theme')
  })

  it('uses the shared menu and theme on the MFA page too', () => {
    createApp()
    const html = nunjucks.render('login-mfa.njk', {})

    expect(html.match(/<header\b/g)).toHaveLength(1)
    expect(html.match(/id="site-menu"/g)).toHaveLength(1)
    expect(html).toContain('id="theme-switch"')
    expect(html).toContain('src="/static/theme.js"')
    expect(html).toContain('name="code"')
  })
})
