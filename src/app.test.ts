import { once } from 'node:events'
import nunjucks from 'nunjucks'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createApp } from './app'

describe('GET /health', () => {
  it('returns the service status and uptime', async () => {
    const server = createApp().listen(0)
    await once(server, 'listening')

    try {
      const address = server.address()
      if (address === null || typeof address === 'string') {
        throw new Error('Expected the server to listen on a TCP port')
      }

      const response = await fetch(`http://127.0.0.1:${address.port}/health`)

      expect(response.status).toBe(200)
      await expect(response.json()).resolves.toEqual({
        status: 'ok',
        uptime: expect.any(Number),
      })
    } finally {
      server.close()
      await once(server, 'close')
    }
  })
})

describe('site menu', () => {
  it('renders safely without current-page context', () => {
    const env = new nunjucks.Environment(new nunjucks.FileSystemLoader('views'), {
      autoescape: true,
    })
    const html = env.render('login.njk', {})

    expect(html).toContain('Welcome back')
    expect(html).not.toContain('aria-current=')
  })

  it.each([
    ['/login', '/login', 'page'],
    ['/register', '/register', 'page'],
    ['/products', '/products', 'page'],
    ['/products/missing', '/products', 'location'],
    ['/login?returnTo=%2Faccount', '/login', 'page'],
  ])('highlights the current menu destination on %s', async (path, href, current) => {
    const response = await request(
      createApp({
        fetchProducts: async () => [],
        fetchProduct: async () => null,
      }),
    ).get(path)

    expect(response.text).toContain(`href="${href}" aria-current="${current}"`)
    expect(response.text.match(/aria-current=/g)).toHaveLength(1)
  })

  it('does not highlight an unrelated destination', async () => {
    const response = await request(createApp()).get('/forgot-password')

    expect(response.text).not.toContain('aria-current=')
  })

  it.each(['/login', '/products', '/register'])(
    'renders the burger menu on %s',
    async (path) => {
      const response = await request(
        createApp({ fetchProducts: async () => [] }),
      ).get(path)

      expect(response.text).toContain('id="menu-toggle"')
      expect(response.text).toContain('aria-controls="site-menu"')
      expect(response.text).toContain('href="/products"')
      expect(response.text).toContain('src="/static/menu.js"')
    },
  )
})
