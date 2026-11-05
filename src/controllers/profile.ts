import { type Request, type Response, Router } from 'express'
import type { Order } from '../models/order'
import type { ProfileInput } from '../models/profile'
import { ProfileError, type ProfileService } from '../services/profileService'
import { clearAuthentication } from '../middleware/authentication'
import type { AuthService } from '../services/authService'

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
const DELETE_ERROR =
  'We could not delete your account right now. Please try again later.'
const PASSWORD_REQUIRED = 'Enter your password to delete your account.'
const PASSWORD_INCORRECT = 'The password is incorrect. Please try again.'
const PASSWORD_LOCKED = 'Too many failed attempts. Please try again later.'

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
    canReorder: order.canReorder,
  }
}

// The backend token is missing or no longer valid, so the customer must sign in again
function signInAgain(req: Request, res: Response) {
  clearAuthentication(req, res)
  res.redirect(`/login?returnTo=${encodeURIComponent('/account')}`)
}

export function createProfileRouter(
  service: ProfileService,
  authService: AuthService,
): Router {
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
    deleteError?: string,
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
      basketPreview: basket.items.slice(0, 3),
      basketMoreCount: Math.max(0, basket.items.length - 3),
      orders: orders?.map(toOrderView) ?? [],
      ordersFailed: orders === null,
      saved,
      deleteError,
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
    const token = req.auth?.accessToken
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
    const token = req.auth?.accessToken
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

  type PasswordCheck =
    | { ok: true }
    | { ok: false; status: number; message: string }

  // The backend does not ask for a password, so it is checked against the sign-in service first
  async function checkPassword(
    req: Request,
    token: string,
  ): Promise<PasswordCheck> {
    const password = String(req.body?.password ?? '')
    if (!password) {
      return { ok: false, status: 400, message: PASSWORD_REQUIRED }
    }

    const { email } = await service.getProfile(token)
    const result = await authService.login(email, password, req.ip ?? 'unknown')
    if (result.status === 'success') return { ok: true }
    if (result.status === 'locked') {
      return { ok: false, status: 429, message: PASSWORD_LOCKED }
    }
    if (result.status === 'error') {
      return { ok: false, status: 503, message: DELETE_ERROR }
    }
    return { ok: false, status: 401, message: PASSWORD_INCORRECT }
  }

  router.post('/delete/verify', async (req, res) => {
    const token = req.auth?.accessToken
    res.set('Cache-Control', 'no-store')
    if (!token) {
      res.status(401).json({ error: 'Please sign in again.' })
      return
    }

    try {
      const check = await checkPassword(req, token)
      if (check.ok) res.status(204).end()
      else res.status(check.status).json({ error: check.message })
    } catch (error) {
      if (error instanceof ProfileError && error.status === 401) {
        res.status(401).json({ error: 'Please sign in again.' })
        return
      }
      console.error('Password check failed', (error as Error).message)
      res.status(502).json({ error: DELETE_ERROR })
    }
  })

  router.post('/delete', async (req, res) => {
    const token = req.auth?.accessToken
    if (!token) {
      signInAgain(req, res)
      return
    }

    async function showDeleteError(status: number, message: string) {
      try {
        await renderPage(res, token as string, status, undefined, false, message)
      } catch (renderError) {
        handleFailure(renderError, req, res)
      }
    }

    try {
      // The password is checked again here, so the confirmation step cannot be skipped
      const check = await checkPassword(req, token)
      if (!check.ok) {
        await showDeleteError(check.status, check.message)
        return
      }
      await service.deleteAccount(token)
    } catch (error) {
      if (error instanceof ProfileError && error.status === 401) {
        signInAgain(req, res)
        return
      }
      // A missing account means it is already gone, so the customer is still signed out below
      if (!(error instanceof ProfileError && error.status === 404)) {
        console.error('Account deletion failed', (error as Error).message)
        await showDeleteError(502, DELETE_ERROR)
        return
      }
    }

    // The backend has revoked the token, so there is nothing left to log out on its side
    clearAuthentication(req, res)
    res.locals.isSignedIn = false
    res.locals.isAdmin = false
    res.locals.csrfToken = req.browserState.csrfToken
    res.set('Cache-Control', 'no-store')
    res.render('account-deleted')
  })

  return router
}
