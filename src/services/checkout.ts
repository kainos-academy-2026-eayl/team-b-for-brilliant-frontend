import { getApiBaseUrl } from './products';

export interface Quote {
    subtotal: string;
    discount: string;
    delivery: string;
    total: string;
}

export interface PlacedOrder extends Quote {
    orderID: string;
}

export interface DeliveryDetails {
    firstname: string;
    surname: string;
    addressLine1: string;
    addressLine2: string;
    postcode: string;
}

export interface CardDetails {
    cardNumber: string;
    expiry: string;
    cvv: string;
}

export interface CheckoutRequest {
    delivery: DeliveryDetails;
    discountCode: string;
    card: CardDetails;
}

export class CheckoutError extends Error {
    status: number;
    fieldErrors: Record<string, string[]>;

    constructor(status: number, message: string, fieldErrors: Record<string, string[]> = {}) {
        super(message);
        this.name = 'CheckoutError';
        this.status = status;
        this.fieldErrors = fieldErrors;
    }
}

export interface CheckoutService {
    getQuote(token: string, discountCode: string): Promise<Quote>;
    placeOrder(token: string, request: CheckoutRequest): Promise<PlacedOrder>;
}

export function createCheckoutService(
    baseUrl: string = getApiBaseUrl(),
    fetchFn: typeof fetch = fetch,
): CheckoutService {
    async function post<T>(path: string, token: string, payload: unknown): Promise<T> {
        const response = await fetchFn(new URL(path, baseUrl), {
            method: 'POST',
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(10000),
            cache: 'no-store',
        });

        if (response.ok) {
            return (await response.json()) as T;
        }

        const body = (await response.json().catch(() => ({}))) as {
            error?: string;
            details?: { fieldErrors?: Record<string, string[]>; };
        };
        throw new CheckoutError(
            response.status,
            body.error ?? `Backend responded ${response.status}`,
            body.details?.fieldErrors ?? {},
        );
    }

    return {
        getQuote: (token, discountCode) => post<Quote>('/checkout/quote', token, { discountCode }),
        placeOrder: (token, request) => post<PlacedOrder>('/checkout', token, request),
    };
}
