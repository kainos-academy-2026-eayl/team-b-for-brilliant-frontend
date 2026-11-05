import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AccountClient } from '../../clients/accountClient';
import type { BasketItem } from '../../models/basket';
import type { Profile } from '../../models/profile';
import { CheckoutError, type CheckoutService, type Quote } from '../../services/checkout';
import type { BasketService } from '../../services/basket';
import type { ProfileService } from '../../services/profileService';
import { createTestApp } from '../helpers/createTestApp';

const accountClient: AccountClient = {
    async uniqueEmail() {
        throw new Error('Email uniqueness should not be checked');
    },
    async register() {
        throw new Error('Registration should not run');
    },
    async verifyCredentials() {
        return { status: 'valid', customerId: 'c1', accessToken: 'checkout-token' };
    },
};

const profile: Profile = {
    email: 'jane@example.com',
    firstname: 'Jane',
    surname: 'Doe',
    addressLine1: '1 High Street',
    addressLine2: null,
    postcode: 'BT7 1NT',
};

const item: BasketItem = {
    basketItemID: 'i1',
    productID: 'p1',
    productName: 'Mug',
    imageUrl: null,
    unitPrice: '10.00',
    lineTotal: '10.00',
    quantityInBasket: 1,
    stockAvailable: 4,
    isQuantityAvailable: true,
    lowStock: false,
};

const quote: Quote = {
    subtotal: '10.00',
    discount: '0.00',
    delivery: '3.99',
    total: '13.99',
};

const submittedValues = {
    addressChoice: 'saved',
    firstname: 'Taylor',
    surname: 'Smith',
    addressLine1: '2 Market Street',
    addressLine2: 'Flat 3',
    postcode: 'BT1 1AA',
    setAsDefault: 'yes',
    discountCode: 'SAVE10',
    cardNumber: '4111 1111 1111 1111',
    expiry: '12/99',
    cvv: '123',
};

function fakeBasket(overrides: Partial<BasketService> = {}): BasketService {
    return {
        async getBasket() {
            return { items: [item], notices: [] };
        },
        async addItem() {},
        async setQuantity() {},
        async removeItem() {},
        ...overrides,
    };
}

function fakeProfile(overrides: Partial<ProfileService> = {}): ProfileService {
    return {
        async getProfile() {
            return profile;
        },
        async updateProfile(_token, input) {
            return { ...profile, ...input };
        },
        async getBasket() {
            return { items: [item], notices: [] };
        },
        async deleteAccount() {},
        async getOrders() {
            return [];
        },
        ...overrides,
    };
}

function fakeCheckout(overrides: Partial<CheckoutService> = {}): CheckoutService {
    return {
        async getQuote() {
            return quote;
        },
        async placeOrder() {
            throw new CheckoutError(500, 'Payment failed');
        },
        ...overrides,
    };
}

async function signedInAgent(options: {
    basketService?: BasketService;
    profileService?: ProfileService;
    checkoutService?: CheckoutService;
} = {}) {
    const agent = request.agent(
        createTestApp({
            accountClient,
            basketService: options.basketService ?? fakeBasket(),
            profileService: options.profileService ?? fakeProfile(),
            checkoutService: options.checkoutService ?? fakeCheckout(),
        }),
    );
    const loginPage = await agent.get('/login');
    const csrfToken = /name="_csrf" value="([^"]+)"/.exec(loginPage.text)?.[1];
    if (!csrfToken) throw new Error('CSRF token not found');

    await agent
        .post('/login')
        .type('form')
        .send({ _csrf: csrfToken, email: 'jane@example.com', password: 'anything' });

    const checkoutPage = await agent.get('/checkout');
    const checkoutCsrfToken = /name="_csrf" value="([^"]+)"/.exec(checkoutPage.text)?.[1];
    if (!checkoutCsrfToken) throw new Error('Checkout CSRF token not found');

    return { agent, csrfToken: checkoutCsrfToken };
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('checkout recovery', () => {
    it('preserves non-card details when an order and its quote refresh both fail', async () => {
        const getQuote = vi.fn<CheckoutService['getQuote']>().mockResolvedValue(quote);
        const placeOrder = vi
            .fn<CheckoutService['placeOrder']>()
            .mockRejectedValue(new CheckoutError(503, 'Payment service unavailable'));
        const checkoutService = fakeCheckout({ getQuote, placeOrder });
        const { agent, csrfToken } = await signedInAgent({ checkoutService });
        getQuote.mockRejectedValue(new CheckoutError(503, 'Quote service unavailable'));
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

        const failedPayment = await agent
            .post('/checkout')
            .type('form')
            .send({ _csrf: csrfToken, ...submittedValues });

        expect(failedPayment.status).toBe(502);
        expect(failedPayment.text).toContain('Taylor');
        expect(failedPayment.text).toContain('2 Market Street');
        expect(failedPayment.text).toContain('SAVE10');
        expect(failedPayment.text).toContain('12/99');
        expect(failedPayment.text).toContain('Your order total is unavailable');
        expect(failedPayment.text).toContain('id="pay-button"');
        expect(failedPayment.text).toMatch(/id="pay-button"[^>]*disabled/);
        expect(failedPayment.text).not.toContain('4111111111111111');
        expect(failedPayment.text).toMatch(/id="cardNumber"[^>]*value=""/);
        expect(failedPayment.text).toMatch(/id="cvv"[^>]*value=""/);
        expect(consoleError).toHaveBeenCalled();

        getQuote.mockResolvedValue(quote);
        const refreshed = await agent
            .post('/checkout/discount')
            .type('form')
            .send({ _csrf: csrfToken, ...submittedValues });

        expect(refreshed.status).toBe(200);
        expect(refreshed.text).toContain('Pay £13.99');
        expect(refreshed.text).not.toMatch(/id="pay-button"[^>]*disabled/);
        expect(refreshed.text).toContain('Taylor');
    });

    it.each(['basket', 'profile'] as const)(
        'preserves submitted details if the %s request fails before checkout',
        async (failedRequest) => {
            const getBasket = vi.fn<BasketService['getBasket']>().mockResolvedValue({
                items: [item],
                notices: [],
            });
            const getProfile = vi.fn<ProfileService['getProfile']>().mockResolvedValue(profile);
            const basketService = fakeBasket({ getBasket });
            const profileService = fakeProfile({ getProfile });
            const getQuote = vi.fn<CheckoutService['getQuote']>().mockResolvedValue(quote);
            const checkoutService = fakeCheckout({ getQuote });
            const { agent, csrfToken } = await signedInAgent({
                basketService,
                profileService,
                checkoutService,
            });
            getQuote.mockClear();
            if (failedRequest === 'basket') {
                getBasket.mockRejectedValue(new Error('Basket service unavailable'));
            } else {
                getProfile.mockRejectedValue(new Error('Profile service unavailable'));
            }
            vi.spyOn(console, 'error').mockImplementation(() => {});

            const response = await agent
                .post('/checkout')
                .type('form')
                .send({ _csrf: csrfToken, ...submittedValues });

            expect(response.status).toBe(502);
            expect(response.text).toContain('Taylor');
            expect(response.text).toContain('2 Market Street');
            expect(response.text).toContain('SAVE10');
            expect(response.text).toContain('12/99');
            expect(response.text).toContain('Your order items are temporarily unavailable');
            expect(response.text).toMatch(/id="pay-button"[^>]*disabled/);
            expect(response.text).not.toContain('4111111111111111');
            expect(response.text).toMatch(/id="cardNumber"[^>]*value=""/);
            expect(response.text).toMatch(/id="cvv"[^>]*value=""/);
            expect(getQuote).not.toHaveBeenCalled();
        },
    );
});
