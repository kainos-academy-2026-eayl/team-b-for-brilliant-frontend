import type { Basket } from '../models/basket';
import { getApiBaseUrl } from './products';

export class BasketError extends Error {
    status: number;

    constructor(status: number, message: string) {
        super(message);
        this.status = status;
    }
}

export interface BasketService {
    getBasket(credential: string): Promise<Basket>;
    addItem(credential: string, productID: string, quantity: number): Promise<void>;
    setQuantity(credential: string, productID: string, quantity: number): Promise<void>;
    removeItem(credential: string, productID: string): Promise<void>;
}

export function createBasketService(
    baseUrl: string = getApiBaseUrl(),
    fetchFn: typeof fetch = fetch,
): BasketService {
    async function call<T>(
        path: string,
        token: string,
        method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET',
        payload?: unknown,
    ): Promise<T> {
        const headers: Record<string, string> = {
            Accept: 'application/json',
            Authorization: `Bearer ${token}`,
        };
        const init: RequestInit = {
            method,
            headers,
            signal: AbortSignal.timeout(5000),
            cache: 'no-store',
        };
        if (payload !== undefined) {
            headers['Content-Type'] = 'application/json';
            init.body = JSON.stringify(payload);
        }

        const response = await fetchFn(new URL(path, baseUrl), init);
        if (response.ok) {
            return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
        }

        const body = (await response.json().catch(() => ({}))) as { error?: string; };
        throw new BasketError(response.status, body.error ?? `Backend responded ${response.status}`);
    }

    return {
        getBasket: (token) => call<Basket>('/basket', token),
        addItem: async (token, productID, quantity) => {
            await call('/basket/items', token, 'POST', { productID, quantity });
        },
        setQuantity: async (token, productID, quantity) => {
            await call(`/basket/items/${encodeURIComponent(productID)}`, token, 'PATCH', { quantity });
        },
        removeItem: async (token, productID) => {
            await call(`/basket/items/${encodeURIComponent(productID)}`, token, 'DELETE');
        },
    };
}
