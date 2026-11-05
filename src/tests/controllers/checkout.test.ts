import request from 'supertest';
import { describe, expect, it } from 'vitest';
import type { AccountClient } from '../../clients/accountClient';
import type { BasketItem } from '../../models/basket';
import type { BasketService } from '../../services/basket';
import { CheckoutError, type CheckoutService, type Quote } from '../../services/checkout';
import { createTestApp as createApp } from '../helpers/createTestApp';
import { stubProfileService } from '../helpers/stubProfileService';

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
    lineTotal: '20.00',
    quantityInBasket: 2,
    stockAvailable: 25,
    isQuantityAvailable: true,
    lowStock: false,
};

const basketService: BasketService = {
    async getBasket() {
        return { items: [item], notices: [] };
    },
    async addItem() { },
    async setQuantity() { },
    async removeItem() { },
};

const fullPrice: Quote = { subtotal: '20.00', discount: '0.00', delivery: '3.99', total: '23.99' };
const discounted: Quote = { subtotal: '20.00', discount: '5.00', delivery: '3.99', total: '18.99' };

const checkoutService: CheckoutService = {
    async getQuote(_token, discountCode) {
        if (discountCode === '') return fullPrice;
        if (discountCode === 'SAVE5') return discounted;
        throw new CheckoutError(400, 'Discount code not found');
    },
    async placeOrder() {
        throw new Error('Orders should not be placed in these tests');
    },
};

function extractToken(html: string): string {
    const match = /name="_csrf" value="([^"]+)"/.exec(html);
    if (!match?.[1]) throw new Error('CSRF token not found');
    return match[1];
}

async function signIn() {
    const agent = request.agent(
        createApp({ accountClient, basketService, profileService: stubProfileService, checkoutService }),
    );
    const token = extractToken((await agent.get('/login')).text);
    await agent
        .post('/login')
        .type('form')
        .send({ _csrf: token, email: 'jane@example.com', password: 'anything' });
    return agent;
}

async function applyDiscount(code: string) {
    const agent = await signIn();
    const token = extractToken((await agent.get('/checkout')).text);
    return agent.post('/checkout/discount').type('form').send({ _csrf: token, discountCode: code });
}

describe('checkout discount codes', () => {
    it('shows the discount above the order total for a valid code', async () => {
        const res = await applyDiscount('SAVE5');

        expect(res.status).toBe(200);
        expect(res.text).toContain('total-discount');
        expect(res.text).toContain('−£5.00');
        expect(res.text).toContain('Pay £18.99');
        expect(res.text.indexOf('total-discount')).toBeLessThan(res.text.indexOf('total-final'));
    });

    it('shows "Invalid discount code" for an unknown code', async () => {
        const res = await applyDiscount('NOPE');

        expect(res.status).toBe(400);
        expect(res.text).toContain('Invalid discount code');
        expect(res.text).not.toContain('Discount code not found');
        expect(res.text).not.toContain('total-discount"');
    });

    it('keeps the pay button available to the page script so clearing an invalid code re-enables it', async () => {
        const res = await applyDiscount('NOPE');

        expect(res.text).toMatch(/id="pay-button"[^>]*data-available="true"[^>]*disabled/);
        expect(res.text).toContain('data-quoted-code=""');
    });
});
