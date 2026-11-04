import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import { createDiscountsRouter } from '../../controllers/discounts'
import type { createDiscount } from '../../services/discounts'
import { createTestApp } from '../helpers/createTestApp'

describe('discount creation authentication', () => {
  it('forwards the verified JWT access token when saving a discount', async () => {
    const saveDiscount = vi
      .fn<typeof createDiscount>()
      .mockResolvedValue(undefined)
    const app = createTestApp({
      tokenClient: {
        getIdentity: async () => ({ customerId: 'admin-1', accessLevel: 1 }),
        logout: async () => {},
      },
    })
    app.use(
      '/test-discounts',
      createDiscountsRouter(async () => [], saveDiscount),
    )
    const agent = request.agent(app)
    const cookie = 'access_token=test-admin-token'
    const page = await agent
      .get('/test-discounts/add')
      .set('Cookie', cookie)
      .expect(200)
    const csrf = /name="_csrf" value="([^"]+)"/.exec(page.text)?.[1]
    if (!csrf) throw new Error('Missing CSRF token')
    const discount = {
      code: 'SAVE20',
      type: 'percentage',
      value: '20',
      expiryDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    }
    const response = await agent
      .post('/test-discounts/add')
      .set('Cookie', cookie)
      .type('form')
      .send({
        _csrf: csrf,
        ...discount,
      })
      .expect(303)
    expect(response.headers.location).toBe('/discounts')
    expect(saveDiscount).toHaveBeenCalledExactlyOnceWith(
      'test-admin-token',
      discount,
    )
  })
})
