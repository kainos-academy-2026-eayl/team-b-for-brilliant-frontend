import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../../app'
import { createDiscount, DiscountSaveError } from '../../services/discounts'
import { validateDiscount } from '../../utils/discountValidation'

const TODAY = '2026-11-03'
const valid = {
  code: 'SUMMER10',
  type: 'percentage',
  value: '10',
  expiryDate: '2027-01-31',
}

function extractToken(html: string): string {
  const match = /name="_csrf" value="([^"]+)"/.exec(html)
  if (!match?.[1]) throw new Error('CSRF token not found')
  return match[1]
}

async function submit(
  fields: Record<string, string>,
  saveDiscount: typeof createDiscount = async () => undefined,
) {
  const agent = request.agent(
    createApp({ fetchDiscounts: async () => [], saveDiscount }),
  )
  const token = extractToken((await agent.get('/discounts/add')).text)
  return agent
    .post('/discounts/add')
    .type('form')
    .send({ _csrf: token, ...fields })
}

describe('discount validation', () => {
  it('accepts valid discounts', () => {
    expect(validateDiscount(valid, TODAY)).toEqual({})
    expect(
      validateDiscount(
        { ...valid, type: 'amount', value: '5.50', expiryDate: TODAY },
        TODAY,
      ),
    ).toEqual({})
  })

  it.each(['0', '15', '100'])('accepts percentage %s', (value) => {
    expect(validateDiscount({ ...valid, value }, TODAY).value).toBeUndefined()
  })

  it.each(['101', '12.5', '-5', 'abc'])('rejects percentage %s', (value) => {
    expect(validateDiscount({ ...valid, value }, TODAY).value).toBeTruthy()
  })

  it.each(['0', '-3', '1.234', 'ten'])('rejects raw amount %s', (value) => {
    expect(
      validateDiscount({ ...valid, type: 'amount', value }, TODAY).value,
    ).toBeTruthy()
  })

  it.each(['ab', 'has space', 'bad!', 'x'.repeat(31)])(
    'rejects code "%s"',
    (code) => {
      expect(validateDiscount({ ...valid, code }, TODAY).code).toBeTruthy()
    },
  )

  it.each(['2026-11-02', '2026-02-30', '31/12/2026', 'soon'])(
    'rejects expiry date %s',
    (expiryDate) => {
      expect(
        validateDiscount({ ...valid, expiryDate }, TODAY).expiryDate,
      ).toBeTruthy()
    },
  )

  it('requires every field', () => {
    expect(
      validateDiscount(
        { code: '', type: '', value: '', expiryDate: '' },
        TODAY,
      ),
    ).toEqual({
      code: 'Enter a discount code.',
      type: 'Select a discount type.',
      value: 'Enter the discount value.',
      expiryDate: 'Enter an expiry date.',
    })
  })

  it('rejects an unknown type', () => {
    expect(
      validateDiscount({ ...valid, type: 'free' }, TODAY).type,
    ).toBeTruthy()
  })
})

describe('createDiscount service', () => {
  it('posts the discount to the backend with the admin token', async () => {
    const fetchFn = vi.fn(async () => new Response(null, { status: 201 }))

    await createDiscount(
      'tok',
      { ...valid, type: 'amount', value: '5.50' } as never,
      'http://backend.test',
      fetchFn as unknown as typeof fetch,
    )

    const [url, init] = fetchFn.mock.calls[0] as unknown as [URL, RequestInit]
    expect(url.href).toBe('http://backend.test/discounts')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>).Authorization).toBe(
      'Bearer tok',
    )
    expect(JSON.parse(init.body as string)).toEqual({
      code: 'SUMMER10',
      type: 'AMOUNT_OFF',
      value: '5.50',
      expiryDate: '2027-01-31',
    })
  })

  it('throws DiscountSaveError when the backend rejects the request', async () => {
    const fetchFn = async () => new Response(null, { status: 409 })
    await expect(
      createDiscount(undefined, valid as never, 'http://backend.test', fetchFn),
    ).rejects.toMatchObject({ status: 409 })
  })
})

describe('add discount page', () => {
  it('shows the form with all fields and a Save Discount button', async () => {
    const response = await request(
      createApp({ fetchDiscounts: async () => [] }),
    ).get('/discounts/add')

    expect(response.status).toBe(200)
    for (const name of ['code', 'type', 'value', 'expiryDate']) {
      expect(response.text).toContain(`name="${name}"`)
    }
    expect(response.text).toContain('Save Discount')
  })

  it('links to the form from the discounts page', async () => {
    const response = await request(
      createApp({ fetchDiscounts: async () => [] }),
    ).get('/discounts')

    expect(response.text).toContain('href="/discounts/add"')
  })

  it('shows errors for blank fields without saving', async () => {
    const save = vi.fn()
    const response = await submit(
      { code: '', type: '', value: '', expiryDate: '' },
      save,
    )

    expect(response.status).toBe(400)
    expect(response.text).toContain('Enter a discount code.')
    expect(response.text).toContain('Select a discount type.')
    expect(response.text).toContain('Enter the discount value.')
    expect(response.text).toContain('Enter an expiry date.')
    expect(save).not.toHaveBeenCalled()
  })

  it('keeps the input and explains an out-of-range percentage', async () => {
    const response = await submit({ ...valid, value: '150' })

    expect(response.status).toBe(400)
    expect(response.text).toContain('cannot be more than 100')
    expect(response.text).toContain('value="150"')
  })

  it('saves a valid discount and redirects to the discounts page', async () => {
    const save = vi.fn(async () => undefined)
    const response = await submit(valid, save)

    expect(response.status).toBe(303)
    expect(response.headers.location).toBe('/discounts')
    expect(save).toHaveBeenCalledWith(undefined, valid)
  })

  it('shows a code error when the backend reports a duplicate', async () => {
    const response = await submit(valid, async () => {
      throw new DiscountSaveError(409)
    })

    expect(response.status).toBe(400)
    expect(response.text).toContain('A discount with this code already exists')
  })

  it('shows a friendly message when the backend is unavailable', async () => {
    const response = await submit(valid, async () => {
      throw new DiscountSaveError(500)
    })

    expect(response.status).toBe(502)
    expect(response.text).toContain('could not be saved right now')
    expect(response.text).toContain('value="SUMMER10"')
  })

  it('rejects submissions without a CSRF token', async () => {
    const response = await request(
      createApp({ fetchDiscounts: async () => [] }),
    )
      .post('/discounts/add')
      .type('form')
      .send(valid)

    expect(response.status).toBe(403)
  })
})
