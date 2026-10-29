import type { Basket } from '../models/basket'
import type { Order } from '../models/order'
import type { Profile, ProfileInput } from '../models/profile'
import { getApiBaseUrl } from './products'

export class ProfileError extends Error {
  readonly status: number
  readonly fieldErrors: Record<string, string[]>

  constructor(
    status: number,
    message: string,
    fieldErrors: Record<string, string[]> = {},
  ) {
    super(message)
    this.name = 'ProfileError'
    this.status = status
    this.fieldErrors = fieldErrors
  }
}

export interface ProfileService {
  getProfile(token: string): Promise<Profile>
  updateProfile(token: string, input: ProfileInput): Promise<Profile>
  getBasket(token: string): Promise<Basket>
  getOrders(token: string): Promise<Order[]>
}

export function createProfileService(
  baseUrl: string = getApiBaseUrl(),
  fetchFn: typeof fetch = fetch,
): ProfileService {
  async function callBackend<T>(
    path: string,
    token: string,
    method: 'GET' | 'PUT' = 'GET',
    payload?: unknown,
  ): Promise<T> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    }
    const init: RequestInit = {
      method,
      headers,
      signal: AbortSignal.timeout(5000),
      cache: 'no-store',
    }
    if (payload !== undefined) {
      headers['Content-Type'] = 'application/json'
      init.body = JSON.stringify(payload)
    }

    const response = await fetchFn(new URL(path, baseUrl), init)

    if (response.ok) return (await response.json()) as T

    if (response.status === 400) {
      const body = (await response.json().catch(() => ({}))) as {
        details?: { fieldErrors?: Record<string, string[]> }
      }
      throw new ProfileError(
        400,
        'Invalid profile',
        body.details?.fieldErrors ?? {},
      )
    }

    throw new ProfileError(
      response.status,
      `Backend responded ${response.status}`,
    )
  }

  return {
    getProfile: (token) => callBackend<Profile>('/profile', token),
    updateProfile: (token, input) =>
      callBackend<Profile>('/profile', token, 'PUT', input),
    getBasket: (token) => callBackend<Basket>('/basket', token),
    getOrders: async (token) =>
      (await callBackend<{ orders: Order[] }>('/orders', token)).orders,
  }
}
