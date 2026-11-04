import { describe, expect, it } from 'vitest'
import { validateDiscount } from '../../utils/discountValidation'

const TODAY = '2026-11-03'
const valid = {
  code: 'SUMMER10',
  type: 'percentage',
  value: '10',
  expiryDate: '2027-01-31',
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
