import { once } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../app'
import type { ProxiedImage } from '../services/images'

async function getImage(
  fetchImage: (fileName: string) => Promise<ProxiedImage | null>,
  path = '/images/product-1.svg',
) {
  const server = createApp(async () => [], fetchImage).listen(0)
  await once(server, 'listening')

  try {
    const address = server.address()
    if (address === null || typeof address === 'string') {
      throw new Error('Expected the server to listen on a TCP port')
    }

    return await fetch(`http://127.0.0.1:${address.port}${path}`)
  } finally {
    server.close()
    await once(server, 'close')
  }
}

describe('GET /images/:fileName', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('serves the image fetched from the backend', async () => {
    const fetchImage = vi.fn(async () => ({
      body: Buffer.from('<svg/>'),
      contentType: 'image/svg+xml',
      cacheControl: 'public, max-age=60',
    }))

    const response = await getImage(fetchImage)

    expect(fetchImage).toHaveBeenCalledWith('product-1.svg')
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/svg+xml')
    expect(response.headers.get('cache-control')).toBe('public, max-age=60')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('content-security-policy')).toContain('sandbox')
    expect(await response.text()).toBe('<svg/>')
  })

  it('returns 404 when the image does not exist', async () => {
    const response = await getImage(async () => null)

    expect(response.status).toBe(404)
  })

  it('returns 502 when the backend fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const response = await getImage(async () => {
      throw new Error('connect ECONNREFUSED')
    })

    expect(response.status).toBe(502)
    expect(await response.text()).not.toContain('ECONNREFUSED')
  })
})
