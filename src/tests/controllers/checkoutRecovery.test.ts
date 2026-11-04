import request from 'supertest';
import { describe, expect, it } from 'vitest';
import type { AccountClient } from '../../clients/accountClient';
import type { BasketItem } from '../../models/basket';
import type { Profile } from '../../models/profile';
import type { BasketService } from '../../services/basket';
import { CheckoutError, type CheckoutService, type Quote } from '../../services/checkout';
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

const item: BasketItem = {
    basketItemID: 'i1',
    productID: 'p1',
    productName: 'Mug',
    imageUrl: null,
    unitPrice: '10.00',
    lineTotal: '10.00',
    quantityInBasket: 1,
    stockAvailable: 5,
    isQuantityAvailable: true,
    lowStock: false,
};

const profile: Profile = {
    email: 'jane@example.com',
    firstname: 'Jane',
    surname: 'Doe',
    addressLine1: '1 High Street',
    addressLine2: null,
    postcode: 'BT7 1NT',
};

const quote: Quote = {
    subtotal: '10.00',
    discount: '0.00',
    delivery: '0.00',
    total: '10.00',
};

const basketService: BasketService = {
    async getBasket() {
        return { items: [item], notices: [] };
    },
    async addItem() {},
    async setQuantity() {},
    async removeItem() {},
};

function profileService(getProfile: () => Promise<Profile> = async () => profile): ProfileService {
    return {
        getProfile,
        async updateProfile(_token, input) {
            return { ...profile, ...input };
        },
        async getBasket() {
            return { items: [item], notices: [] };
        },
        async getOrders() {
            return [];
        },
    };
}

function csrfFrom(html: string): string {
    const match = /name="_csrf" value="([^"]+)"/.exec(html);
    if (!match?.[1]) throw new Error('CSRF token not found');
    return match[1];
}

async function signIn(profile: ProfileService, checkout: CheckoutService) {
    const agent = request.agent(
        createTestApp({ accountClient, profileService: profile, basketService, checkoutService: checkout }),
    );
    const token = csrfFrom((await agent.get('/login')).text);
    await agent
        .post('/login')
        .type('form')
        .send({ _csrf: token, email: 'jane@example.com', password: 'correct' });
    return agent;
}

const submittedValues = {
    addressChoice: 'new',
    firstname: 'Janet',
    surname: 'Smith',
    addressLine1: '5 New Road',
    addressLine2: 'Flat 2',
    postcode: 'BT1 2AB',
    discountCode: 'SAVE10',
    cardNumber: '1111222233334444',
    expiry: '08/29',
    cvv: '123',
};

describe('checkout recovery', () => {
    it('preserves non-card values and disables payment when refreshing a quote fails', async () => {
        let quoteCalls = 0;
        const checkout: CheckoutService = {
            async getQuote() {
                quoteCalls += 1;
                if (quoteCalls > 1) throw new Error('Quote service unavailable');
                return quote;
            },
            async placeOrder() {
                throw new CheckoutError(500, 'Order service unavailable');
            },
        };
        const agent = await signIn(profileService(), checkout);
        const csrf = csrfFrom((await agent.get('/checkout')).text);

        const res = await agent
            .post('/checkout')
            .type('form')
            .send({ ...submittedValues, _csrf: csrf });

        expect(res.status).toBe(502);
        expect(res.text).toContain('value="Janet"');
        expect(res.text).toContain('value="Smith"');
        expect(res.text).toContain('value="5 New Road"');
        expect(res.text).toContain('value="Flat 2"');
        expect(res.text).toContain('value="BT1 2AB"');
        expect(res.text).toContain('value="SAVE10"');
        expect(res.text).toContain('value="08/29"');
        expect(res.text).not.toContain('value="1111222233334444"');
        expect(res.text).not.toContain('value="123"');
        expect(res.text).toContain('Order totals are unavailable.');
        expect(res.text).toContain('id="pay-button"');
        expect(res.text).toMatch(/id="pay-button"[^>]*disabled/);
    });

    it('preserves submitted values when basket or profile preflight fails', async () => {
        let profileCalls = 0;
        const checkout: CheckoutService = {
            async getQuote() {
                return quote;
            },
            async placeOrder() {
                throw new Error('Order should not be placed');
            },
        };
        const service = profileService(async () => {
            profileCalls += 1;
            if (profileCalls > 1) throw new Error('Profile service unavailable');
            return profile;
        });
        const agent = await signIn(service, checkout);
        const csrf = csrfFrom((await agent.get('/checkout')).text);

        const res = await agent
            .post('/checkout')
            .type('form')
            .send({ ...submittedValues, _csrf: csrf });

        expect(res.status).toBe(502);
        expect(res.text).toContain('value="Janet"');
        expect(res.text).toContain('value="5 New Road"');
        expect(res.text).toContain('value="SAVE10"');
        expect(res.text).toContain('value="08/29"');
        expect(res.text).not.toContain('value="1111222233334444"');
        expect(res.text).not.toContain('value="123"');
        expect(res.text).toContain('Order totals are unavailable.');
        expect(res.text).toMatch(/id="pay-button"[^>]*disabled/);
    });
});
