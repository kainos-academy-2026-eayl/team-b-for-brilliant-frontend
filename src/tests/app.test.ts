import { once } from 'node:events'
import { describe, expect, it } from 'vitest'
import { createApp } from '../app'

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
