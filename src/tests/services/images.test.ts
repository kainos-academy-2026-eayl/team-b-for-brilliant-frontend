import { describe, expect, it, vi } from 'vitest'
import { fetchImage, MAX_IMAGE_BYTES, toProxiedImageUrl } from '../../services/images'

const baseUrl = 'http://backend.internal:3001'

function imageResponse(
  body: string,
  headers: Record<string, string> = { 'Content-Type': 'image/svg+xml' },
  status = 200,
): Response {
  return new Response(body, { status, headers })
}

describe('toProxiedImageUrl', () => {
  it('maps a relative backend image path to a frontend path', () => {
    expect(toProxiedImageUrl('/images/product-1.svg', baseUrl)).toBe(
      '/images/product-1.svg',
    )
  })

  it('maps an absolute backend image URL to a frontend path', () => {
    expect(
      toProxiedImageUrl(
        'http://backend.internal:3001/images/product-1.svg',
        baseUrl,
      ),
    ).toBe('/images/product-1.svg')
  })

  it.each([
    ['another host', 'http://evil.example/images/a.svg'],
    ['a path outside /images', '/secrets/a.svg'],
    ['a nested path', '/images/sub/a.svg'],
    ['path traversal', '/images/..%2Fsecret'],
    ['a hidden file', '/images/.env'],
  ])('returns null for %s', (_label, imageUrl) => {
    expect(toProxiedImageUrl(imageUrl, baseUrl)).toBeNull()
  })
})

describe('fetchImage', () => {
  it('fetches the image from the backend', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(imageResponse('<svg/>'))

    const image = await fetchImage('product-1.svg', baseUrl, fetchFn)

    expect(String(fetchFn.mock.calls[0]?.[0])).toBe(
      'http://backend.internal:3001/images/product-1.svg',
    )
    expect(image?.contentType).toBe('image/svg+xml')
    expect(image?.body.toString()).toBe('<svg/>')
  })

  it('does not call the backend for unsafe file names', async () => {
    const fetchFn = vi.fn<typeof fetch>()

    await expect(fetchImage('../secret', baseUrl, fetchFn)).resolves.toBeNull()
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('returns null when the backend has no such image', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(imageResponse('', {}, 404))

    await expect(fetchImage('a.svg', baseUrl, fetchFn)).resolves.toBeNull()
  })

  it('rejects non-image content', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        imageResponse('<script>', { 'Content-Type': 'text/html' }),
      )

    await expect(fetchImage('a.svg', baseUrl, fetchFn)).rejects.toThrow(
      'non-image content',
    )
  })

  it('rejects images that are too large', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      imageResponse('x', {
        'Content-Type': 'image/png',
        'Content-Length': String(MAX_IMAGE_BYTES + 1),
      }),
    )

    await expect(fetchImage('a.png', baseUrl, fetchFn)).rejects.toThrow(
      'maximum allowed size',
    )
  })
})
