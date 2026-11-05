import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createApp } from '../../app'
import nunjucks from 'nunjucks'

describe('shared navigation', () => {
  it.each([
    ['/products/add', '/products/add', 'page'],
    ['/products/add/', '/products/add', 'page'],
    ['/products', '/products', 'page'],
    ['/products/', '/products', 'location'],
    ['/products/product-1', '/products', 'location'],
    ['/products/additional', '/products', 'location'],
    ['/account', '/account', 'page'],
  ])('highlights only the matching menu entry on %s', (currentPath, destination, current) => {
    const environment = new nunjucks.Environment(new nunjucks.FileSystemLoader('views'), { autoescape: true })
    const html = environment.render('main.njk', {
      currentPath, isAdmin: true, isSignedIn: true, csrfToken: 'test-token',
    })
    const highlighted = html.match(/<a\b[^>]*\baria-current="[^"]+"[^>]*>/g) ?? []
    expect(highlighted).toEqual([`<a href="${destination}" aria-current="${current}">`])
  })

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

})
