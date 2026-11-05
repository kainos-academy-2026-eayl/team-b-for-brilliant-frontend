import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createTestApp as createApp } from '../helpers/createTestApp'
import type { AccountClient } from '../../clients/accountClient'
import type { Profile, ProfileInput } from '../../models/profile'
import {
  ProfileError,
  type ProfileService,
} from '../../services/profileService'

const accountClient: AccountClient = {
  async uniqueEmail() {
    throw new Error('Email uniqueness should not be checked')
  },
  async register() {
    throw new Error('Registration should not run')
  },
  async verifyCredentials(_email, password) {
    if (password !== 'correct') return { status: 'invalid' }
    return {
      status: 'valid',
      customerId: 'c1',
      accessToken: 'api-token',
    }
  },
}

const savedProfile: Profile = {
  email: 'jane@example.com',
  firstname: 'Jane',
  surname: 'Doe',
  addressLine1: '1 High Street',
  addressLine2: null,
  postcode: 'BT7 1NT',
}

function createFakeService(overrides: Partial<ProfileService> = {}) {
  const calls: { method: string; token: string; input?: ProfileInput }[] = []
  const service: ProfileService = {
    async getProfile(token) {
      calls.push({ method: 'getProfile', token })
      return savedProfile
    },
    async updateProfile(token, input) {
      calls.push({ method: 'updateProfile', token, input })
      return { ...savedProfile, ...input }
    },
    async getBasket(token) {
      calls.push({ method: 'getBasket', token })
      return {
        items: [
          {
            basketItemID: 'b1',
            productID: 'p1',
            productName: 'Lip Balm',
            imageUrl: null,
            unitPrice: null,
            lineTotal: null,
            quantityInBasket: 2,
            stockAvailable: 4,
            isQuantityAvailable: true,
            lowStock: true,
          },
       ],
       notices: [],
     }
    },
    async getOrders(token) {
      calls.push({ method: 'getOrders', token })
      return [
        {
          orderID: 'order-abc',
          placedAt: '2026-10-20T09:30:00.000Z',
          total: '21.99',
          canReorder: false,
          items: [
            {
              productID: 'p1',
              productName: 'Face Cream',
              quantity: 1,
              unitPrice: '12.99',
              lineTotal: '12.99',
            },
            {
              productID: 'p2',
              productName: 'Hand Balm',
              quantity: 2,
              unitPrice: '4.50',
              lineTotal: '9.00',
            },
          ],
        },
      ]
    },
    async deleteAccount(token) {
      calls.push({ method: 'deleteAccount', token })
    },
    ...overrides,
  }
  return { service, calls }
}

function csrfFrom(html: string): string {
  const match = /name="_csrf" value="([^"]+)"/.exec(html)
  if (!match?.[1]) throw new Error('CSRF token not found')
  return match[1]
}

async function signIn(service: ProfileService) {
  const agent = request.agent(
    createApp({ accountClient, profileService: service }),
  )
  const token = csrfFrom((await agent.get('/login')).text)
  await agent
    .post('/login')
    .type('form')
    .send({ _csrf: token, email: 'jane@example.com', password: 'correct' })
  return agent
}

const validForm = {
  firstname: 'Jane',
  surname: 'Doe',
  addressLine1: '1 High Street',
  addressLine2: '',
  postcode: 'bt7 1nt',
}

describe('profile page', () => {
  it('redirects visitors who are not signed in to login', async () => {
    const { service } = createFakeService()
    const res = await request(
      createApp({ accountClient, profileService: service }),
    ).get('/account')

    expect(res.status).toBe(302)
    expect(res.headers.location).toBe('/login?returnTo=%2Faccount')
  })

  it('shows the saved details and the basket, calling the backend with the JWT', async () => {
    const { service, calls } = createFakeService()
    const agent = await signIn(service)

    const res = await agent.get('/account')

    expect(res.status).toBe(200)
    expect(res.text).toContain('Hello Jane!')
    expect(res.text).not.toContain('<h2>Your details</h2>')
    expect(res.text).toContain('value="jane@example.com" readonly')
    expect(res.text.indexOf('id="surname"')).toBeLessThan(
      res.text.indexOf('id="email"'),
    )
    expect(res.text.indexOf('id="email"')).toBeLessThan(
      res.text.indexOf('id="addressLine1"'),
    )
    expect(res.text).toContain('value="1 High Street"')
    expect(res.text).toContain('Lip Balm, quantity 2')
    expect(res.text).toContain('only 4 left')
    expect(res.text).toContain('src="/static/images/default-profile.svg"')
    expect(res.text).toMatch(/name="_csrf" value="[^"]+"/)
    expect(res.headers['cache-control']).toBe('no-store')
    expect(calls.every((call) => call.token === 'api-token')).toBe(true)
  })

  it('lists past orders with date, reference, products and total', async () => {
    const { service, calls } = createFakeService()
    const agent = await signIn(service)

    const res = await agent.get('/account')

    expect(res.text).toContain('Your orders')
    expect(res.text).toContain('Order placed 20 October 2026')
    expect(res.text).toContain('Order reference: order-abc')
    expect(res.text).toContain('Face Cream, quantity 1 at £12.99 each (£12.99)')
    expect(res.text).toContain('Hand Balm, quantity 2 at £4.50 each (£9.00)')
    expect(res.text).toContain('Total: £21.99')
    expect(calls).toContainEqual({ method: 'getOrders', token: 'api-token' })
  })

  it('shows a message when there are no orders', async () => {
    const { service } = createFakeService({ getOrders: async () => [] })
    const agent = await signIn(service)

    expect((await agent.get('/account')).text).toContain(
      'You have not placed any orders yet',
    )
  })

  it('still shows the profile when orders cannot be loaded', async () => {
    const { service } = createFakeService({
      getOrders: async () => {
        throw new ProfileError(500, 'Backend responded 500')
      },
    })
    const agent = await signIn(service)

    const res = await agent.get('/account')

    expect(res.status).toBe(200)
    expect(res.text).toContain('Hello Jane!')
    expect(res.text).toContain('We could not load your orders right now')
  })

  it('sends the customer to sign in again when the orders call is unauthorised', async () => {
    const { service } = createFakeService({
      getOrders: async () => {
        throw new ProfileError(401, 'Backend responded 401')
      },
    })
    const agent = await signIn(service)

    const res = await agent.get('/account')

    expect(res.status).toBe(302)
    expect(res.headers.location).toContain('/login')
  })

  it('serves the default profile picture locally', async () => {
    const { service } = createFakeService()
    const res = await request(
      createApp({ accountClient, profileService: service }),
    ).get('/static/images/default-profile.svg')

    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toContain('image/svg+xml')
  })

  it('shows an empty basket message', async () => {
    const { service } = createFakeService({
      getBasket: async () => ({ items: [], notices: [] }),
    })
    const agent = await signIn(service)

    expect((await agent.get('/account')).text).toContain('Your basket is empty')
  })

  it('saves valid details, then redirects with a confirmation', async () => {
    const { service, calls } = createFakeService()
    const agent = await signIn(service)
    const token = csrfFrom((await agent.get('/account')).text)

    const res = await agent
      .post('/account')
      .type('form')
      .send({ ...validForm, firstname: '  Jane  ', _csrf: token })

    expect(res.status).toBe(302)
    expect(res.headers.location).toBe('/account?saved=1')
    expect(
      calls.find((call) => call.method === 'updateProfile')?.input,
    ).toEqual({
      ...validForm,
      firstname: 'Jane',
    })
    expect((await agent.get('/account?saved=1')).text).toContain(
      'Your details have been saved',
    )
  })

  it('rejects a save without a CSRF token', async () => {
    const { service, calls } = createFakeService()
    const agent = await signIn(service)

    const res = await agent.post('/account').type('form').send(validForm)

    expect(res.status).toBe(403)
    expect(calls.some((call) => call.method === 'updateProfile')).toBe(false)
  })

  it('shows friendly field errors and keeps what the customer typed', async () => {
    const { service } = createFakeService({
      updateProfile: async () => {
        throw new ProfileError(400, 'Invalid profile', { postcode: ['bad'] })
      },
    })
    const agent = await signIn(service)
    const token = csrfFrom((await agent.get('/account')).text)

    const res = await agent
      .post('/account')
      .type('form')
      .send({
        ...validForm,
        addressLine1: '<b>5 Road</b>',
        postcode: 'nonsense',
        _csrf: token,
      })

    expect(res.status).toBe(400)
    expect(res.text).toContain('Enter a valid UK postcode, like BT7 1NT')
    expect(res.text).toContain('aria-invalid="true"')
    expect(res.text).toContain('value="nonsense"')
    expect(res.text).toContain('&lt;b&gt;5 Road&lt;/b&gt;')
    expect(res.text).not.toContain('<b>5 Road</b>')
  })

  it('sends the customer back to login when the backend no longer accepts the token', async () => {
    const { service } = createFakeService({
      getProfile: async () => {
        throw new ProfileError(401, 'Unauthorised')
      },
    })
    const agent = await signIn(service)

    const res = await agent.get('/account')

    expect(res.status).toBe(302)
    expect(res.headers.location).toBe('/login?returnTo=%2Faccount')
    expect((await agent.get('/account')).headers.location).toContain('/login')
  })

  it('shows a friendly error when the backend is unavailable', async () => {
    const { service } = createFakeService({
      getProfile: async () => {
        throw new ProfileError(503, 'down')
      },
    })
    const agent = await signIn(service)

    const res = await agent.get('/account')

    expect(res.status).toBe(502)
    expect(res.text).toContain('We could not load your profile right now')
  })
})

describe('delete account', () => {
  it('shows a Delete account button below Save details with a confirmation dialog', async () => {
    const { service } = createFakeService()
    const agent = await signIn(service)

    const res = await agent.get('/account')

    expect(res.text).toContain('Delete account</button>')
    expect(res.text.indexOf('Save details')).toBeLessThan(
      res.text.indexOf('id="delete-account-open"'),
    )
    expect(res.text).toContain(
      'Once an account is deleted all its data is lost, are you sure?',
    )
    expect(res.text).toContain('action="/account/delete"')
    expect(res.text).toContain('type="password"')
    expect(res.text.indexOf('id="delete-password"')).toBeLessThan(
      res.text.indexOf('are you sure?'),
    )
    expect(res.text).toContain('/static/delete-account.js')
  })

  it('does not delete anything until the form is submitted', async () => {
    const { service, calls } = createFakeService()
    const agent = await signIn(service)

    await agent.get('/account')

    expect(calls.some((call) => call.method === 'deleteAccount')).toBe(false)
  })

  it('deletes the account, signs the customer out and shows a success message', async () => {
    const { service, calls } = createFakeService()
    const agent = await signIn(service)
    const token = csrfFrom((await agent.get('/account')).text)

    const res = await agent.post('/account/delete').type('form').send({ _csrf: token, password: 'correct' })

    expect(res.status).toBe(200)
    expect(res.text).toContain('Your account has been deleted')
    expect(res.text).toContain('http-equiv="refresh" content="5;url=/login"')
    expect(res.text).not.toContain('action="/logout"')
    expect(calls).toContainEqual({ method: 'deleteAccount', token: 'api-token' })

    const after = await agent.get('/account')
    expect(after.status).toBe(302)
    expect(after.headers.location).toBe('/login?returnTo=%2Faccount')
  })

  it('rejects a request without a CSRF token', async () => {
    const { service, calls } = createFakeService()
    const agent = await signIn(service)

    const res = await agent.post('/account/delete').type('form').send({})

    expect(res.status).toBe(403)
    expect(calls.some((call) => call.method === 'deleteAccount')).toBe(false)
  })

  it('keeps the customer signed in and shows an error when deletion fails', async () => {
    const { service } = createFakeService({
      deleteAccount: async () => {
        throw new ProfileError(500, 'Backend responded 500')
      },
    })
    const agent = await signIn(service)
    const token = csrfFrom((await agent.get('/account')).text)

    const res = await agent.post('/account/delete').type('form').send({ _csrf: token, password: 'correct' })

    expect(res.status).toBe(502)
    expect(res.text).toContain('We could not delete your account right now')
    expect(res.text).toContain('Hello Jane!')
    expect((await agent.get('/account')).status).toBe(200)
  })

  it('sends the customer to sign in again when the token is no longer valid', async () => {
    const { service } = createFakeService({
      deleteAccount: async () => {
        throw new ProfileError(401, 'Backend responded 401')
      },
    })
    const agent = await signIn(service)
    const token = csrfFrom((await agent.get('/account')).text)

    const res = await agent.post('/account/delete').type('form').send({ _csrf: token, password: 'correct' })

    expect(res.status).toBe(302)
    expect(res.headers.location).toBe('/login?returnTo=%2Faccount')
  })

  it('treats an account that is already gone as deleted', async () => {
    const { service } = createFakeService({
      deleteAccount: async () => {
        throw new ProfileError(404, 'Backend responded 404')
      },
    })
    const agent = await signIn(service)
    const token = csrfFrom((await agent.get('/account')).text)

    const res = await agent.post('/account/delete').type('form').send({ _csrf: token, password: 'correct' })

    expect(res.status).toBe(200)
    expect(res.text).toContain('Your account has been deleted')
  })

  it('checks the password before the confirmation prompt is shown', async () => {
    const { service, calls } = createFakeService()
    const agent = await signIn(service)
    const token = csrfFrom((await agent.get('/account')).text)

    const valid = await agent
      .post('/account/delete/verify')
      .type('form')
      .send({ _csrf: token, password: 'correct' })
    const wrong = await agent
      .post('/account/delete/verify')
      .type('form')
      .send({ _csrf: token, password: 'nope' })
    const empty = await agent
      .post('/account/delete/verify')
      .type('form')
      .send({ _csrf: token, password: '' })

    expect(valid.status).toBe(204)
    expect(wrong.status).toBe(401)
    expect(wrong.body.error).toContain('password is incorrect')
    expect(empty.status).toBe(400)
    expect(calls.some((call) => call.method === 'deleteAccount')).toBe(false)
  })

  it('does not delete the account when the password is wrong', async () => {
    const { service, calls } = createFakeService()
    const agent = await signIn(service)
    const token = csrfFrom((await agent.get('/account')).text)

    const res = await agent
      .post('/account/delete')
      .type('form')
      .send({ _csrf: token, password: 'nope' })

    expect(res.status).toBe(401)
    expect(res.text).toContain('The password is incorrect')
    expect(res.text).toContain('Hello Jane!')
    expect(calls.some((call) => call.method === 'deleteAccount')).toBe(false)
    expect((await agent.get('/account')).status).toBe(200)
  })

  it('does not delete the account when no password is sent', async () => {
    const { service, calls } = createFakeService()
    const agent = await signIn(service)
    const token = csrfFrom((await agent.get('/account')).text)

    const res = await agent.post('/account/delete').type('form').send({ _csrf: token })

    expect(res.status).toBe(400)
    expect(calls.some((call) => call.method === 'deleteAccount')).toBe(false)
  })
})
