import { type Request, type Response, Router } from 'express'
import type { Order } from '../models/order'
import type { ProfileInput } from '../models/profile'
import { ProfileError, type ProfileService } from '../services/profileService'

type FieldErrors = Partial<Record<keyof ProfileInput, string>>

const FIELD_MESSAGES: Record<keyof ProfileInput, string> = {
  firstname: 'Enter your first name (up to 50 characters)',
  surname: 'Enter your surname (up to 50 characters)',
  addressLine1: 'Enter the first line of your address (up to 100 characters)',
  addressLine2: 'Address line 2 must be 100 characters or fewer',
  postcode: 'Enter a valid UK postcode, like BT7 1NT',
}

const LOAD_ERROR =
  'We could not load your profile right now. Please try again later.'

function readForm(body: unknown): ProfileInput {
  const source = (body ?? {}) as Record<string, unknown>
  const read = (name: string) => String(source[name] ?? '').trim()

  return {
    firstname: read('firstname'),
    surname: read('surname'),
    addressLine1: read('addressLine1'),
    addressLine2: read('addressLine2'),
    postcode: read('postcode'),
  }
}

function toFieldErrors(fieldErrors: Record<string, string[]>): FieldErrors {
  const errors: FieldErrors = {}
  for (const field of Object.keys(FIELD_MESSAGES) as (keyof ProfileInput)[]) {
    if (fieldErrors[field]?.length) errors[field] = FIELD_MESSAGES[field]
  }
  return errors
}

const dateFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'Europe/London',
})

function toOrderView(order: Order) {
  return {
    orderID: order.orderID,
    placedOn: dateFormat.format(new Date(order.placedAt)),
    total: order.total,
    items: order.items,
  }
}

// The backend token is missing or no longer valid, so the customer must sign in again
function signInAgain(req: Request, res: Response) {
  req.session.destroy(() => {
    res.clearCookie('connect.sid')
    res.redirect(`/login?returnTo=${encodeURIComponent('/account')}`)
  })
}

export function createProfileRouter(service: ProfileService): Router {
  const router = Router()

  function handleFailure(error: unknown, req: Request, res: Response) {
    if (error instanceof ProfileError && error.status === 401) {
      signInAgain(req, res)
      return
    }
    console.error('Profile page failed', (error as Error).message)
    res.status(502).render('error', { message: LOAD_ERROR })
  }

  // Orders are secondary, so a failure shows a message instead of hiding the whole page
  async function loadOrders(token: string): Promise<Order[] | null> {
    try {
      return await service.getOrders(token)
    } catch (error) {
      if (error instanceof ProfileError && error.status === 401) throw error
      console.error('Orders failed to load', (error as Error).message)
      return null
    }
  }

  async function renderPage(
    res: Response,
    token: string,
    status: number,
    form?: { values: ProfileInput; errors: FieldErrors },
    saved = false,
  ) {
    const [profile, basket, orders] = await Promise.all([
      service.getProfile(token),
      service.getBasket(token),
      loadOrders(token),
    ])

    res.set('Cache-Control', 'no-store')
    res.status(status).render('user-profiles', {
      profile,
      basket,
      orders: orders?.map(toOrderView) ?? [],
      ordersFailed: orders === null,
      saved,
      values: form?.values ?? {
        firstname: profile.firstname ?? '',
        surname: profile.surname ?? '',
        addressLine1: profile.addressLine1 ?? '',
        addressLine2: profile.addressLine2 ?? '',
        postcode: profile.postcode ?? '',
      },
      errors: form?.errors ?? {},
      hasErrors: Boolean(form),
    })
  }

  router.get('/', async (req, res) => {
    const token = req.session.apiToken
    if (!token) {
      signInAgain(req, res)
      return
    }

    try {
      await renderPage(res, token, 200, undefined, req.query.saved === '1')
    } catch (error) {
      handleFailure(error, req, res)
    }
  })

  router.post('/', async (req, res) => {
    const token = req.session.apiToken
    if (!token) {
      signInAgain(req, res)
      return
    }

    const values = readForm(req.body)

    try {
      await service.updateProfile(token, values)
      res.redirect('/account?saved=1')
    } catch (error) {
      if (error instanceof ProfileError && error.status === 400) {
        try {
          await renderPage(res, token, 400, {
            values,
            errors: toFieldErrors(error.fieldErrors),
          })
        } catch (renderError) {
          handleFailure(renderError, req, res)
        }
        return
      }
      handleFailure(error, req, res)
    }
  })

  return router
}
