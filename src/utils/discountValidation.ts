export const DISCOUNT_TYPES = ['percentage', 'amount'] as const

export type DiscountType = (typeof DISCOUNT_TYPES)[number]

export interface DiscountFormValues {
  code: string
  type: string
  value: string
  expiryDate: string
}

export type DiscountFormErrors = Partial<
  Record<keyof DiscountFormValues, string>
>

export const EMPTY_DISCOUNT_FORM: DiscountFormValues = {
  code: '',
  type: '',
  value: '',
  expiryDate: '',
}

export function readDiscountForm(body: unknown): DiscountFormValues {
  const source = (body ?? {}) as Record<string, unknown>
  const read = (key: string) =>
    typeof source[key] === 'string' ? (source[key] as string).trim() : ''
  return {
    code: read('code'),
    type: read('type'),
    value: read('value'),
    expiryDate: read('expiryDate'),
  }
}

function validateCode(code: string): string | undefined {
  if (!code) return 'Enter a discount code.'
  if (code.length < 3 || code.length > 30) {
    return 'The discount code must be between 3 and 30 characters long.'
  }
  if (!/^[A-Za-z0-9_-]+$/.test(code)) {
    return 'The discount code can only contain letters, numbers, hyphens and underscores, with no spaces.'
  }
  return undefined
}

function validatePercentage(value: string): string | undefined {
  if (!/^\d+$/.test(value)) {
    return 'Enter a whole number between 0 and 100, for example 15. Decimals are not allowed.'
  }
  if (Number(value) > 100)
    return 'A percentage discount cannot be more than 100.'
  return undefined
}

function validateRawAmount(value: string): string | undefined {
  if (!/^\d+(\.\d{1,2})?$/.test(value)) {
    return 'Enter a positive amount with up to 2 decimal places, for example 5.50.'
  }
  if (Number(value) <= 0) return 'The amount must be greater than 0.'
  return undefined
}

function validateExpiryDate(
  expiryDate: string,
  today: string,
): string | undefined {
  if (!expiryDate) return 'Enter an expiry date.'
  const parsed = /^(\d{4})-(\d{2})-(\d{2})$/.exec(expiryDate)
  const date = parsed
    ? new Date(
        Date.UTC(Number(parsed[1]), Number(parsed[2]) - 1, Number(parsed[3])),
      )
    : undefined
  if (!parsed || !date || date.toISOString().slice(0, 10) !== expiryDate) {
    return 'Enter a valid expiry date, for example 31/12/2026.'
  }
  if (expiryDate < today) return 'The expiry date cannot be in the past.'
  return undefined
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

// A discount stops being usable on its expiry date, so deactivating sets that date to today.
export function isDiscountActive(
  expiryDate: string,
  today: string = todayIso(),
): boolean {
  return expiryDate.slice(0, 10) > today
}

export function validateReactivationDate(
  expiryDate: string,
  today: string = todayIso(),
): string | undefined {
  const error = validateExpiryDate(expiryDate, today)
  if (error) return error
  if (expiryDate === today) {
    return 'The expiry date must be after today for the discount to be active.'
  }
  return undefined
}

export function validateDiscount(
  values: DiscountFormValues,
  today: string = new Date().toISOString().slice(0, 10),
): DiscountFormErrors {
  const errors: DiscountFormErrors = {}

  const codeError = validateCode(values.code)
  if (codeError) errors.code = codeError

  if (!values.type) {
    errors.type = 'Select a discount type.'
  } else if (!(DISCOUNT_TYPES as readonly string[]).includes(values.type)) {
    errors.type = 'Select a valid discount type from the list.'
  }

  if (!values.value) {
    errors.value = 'Enter the discount value.'
  } else if (values.type === 'percentage') {
    const message = validatePercentage(values.value)
    if (message) errors.value = message
  } else if (values.type === 'amount') {
    const message = validateRawAmount(values.value)
    if (message) errors.value = message
  }

  const expiryError = validateExpiryDate(values.expiryDate, today)
  if (expiryError) errors.expiryDate = expiryError

  return errors
}
