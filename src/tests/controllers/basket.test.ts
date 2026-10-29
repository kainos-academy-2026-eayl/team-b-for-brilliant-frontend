import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../app';
import type { AccountClient } from '../../clients/accountClient';
import type { BasketItem } from '../../models/basket';
import { BasketError, type BasketService } from '../../services/basket';

const accountClient: AccountClient = {
    async verifyCredentials() {
        return { status: 'valid', customerId: 'c1', mfaEnabled: false };
    },
    async verifyMfa() {
        throw new Error('MFA should not run');
    },
};

const item: BasketItem = {
    basketItemID: 'i1',
    productID: 'p1',
    productName: 'Mug',
    quantityInBasket: 2,
    stockAvailable: 25,
    isQuantityAvailable: true,
    lowStock: false,
};

function fakeBasket(
    overrides: Partial<BasketService> & { items?: BasketItem[]; } = {},
): BasketService {
    const { items = [item], ...methods } = overrides;
    return {
        async getBasket() {
            return { items };
        },
        async addItem() { },
        async setQuantity() { },
        async removeItem() { },
        ...methods,
    };
}

function extractToken(html: string): string {
    const match = /name="_csrf" value="([^"]+)"/.exec(html);
    if (!match?.[1]) throw new Error('CSRF token not found');
    return match[1];
}

async function signIn(basketService: BasketService) {
    const agent = request.agent(createApp({ accountClient, basketService }));
    const token = extractToken((await agent.get('/login')).text);
    await agent
        .post('/login')
        .type('form')
        .send({ _csrf: token, email: 'jane@example.com', password: 'anything' });
    return agent;
}

describe('GET /basket', () => {
    it('shows the items in the basket', async () => {
        const agent = await signIn(fakeBasket());
        const res = await agent.get('/basket');

        expect(res.status).toBe(200);
        expect(res.text).toContain('Mug');
    });

    it('shows a notice when an item is low in stock', async () => {
        const agent = await signIn(
            fakeBasket({ items: [{ ...item, stockAvailable: 4, lowStock: true }] }),
        );
        const res = await agent.get('/basket');

        expect(res.text).toContain('only 4 left');
    });

    it('shows a message when the basket is empty', async () => {
        const agent = await signIn(fakeBasket({ items: [] }));
        const res = await agent.get('/basket');

        expect(res.text).toContain('Your basket is empty');
    });

    it('asks the customer to reduce a quantity that is no longer available', async () => {
        const agent = await signIn(
            fakeBasket({
                items: [{ ...item, stockAvailable: 1, isQuantityAvailable: false }],
            }),
        );
        const res = await agent.get('/basket');

        expect(res.text).toContain('Reduce the quantity');
    });

    it('redirects signed-out visitors to login', async () => {
        const res = await request(
            createApp({ accountClient, basketService: fakeBasket() }),
        ).get('/basket');

        expect(res.status).toBe(302);
        expect(res.headers.location).toContain('/login');
    });
});

describe('changing the basket', () => {
    it('updates a quantity and redirects back to the basket', async () => {
        const calls: unknown[][] = [];
        const agent = await signIn(
            fakeBasket({
                async setQuantity(...args) {
                    calls.push(args);
                },
            }),
        );
        const token = extractToken((await agent.get('/basket')).text);

        const res = await agent
            .post('/basket/items/p1/update')
            .type('form')
            .send({ _csrf: token, quantity: '3' });

        expect(res.status).toBe(302);
        expect(res.headers.location).toBe('/basket');
        expect(calls).toEqual([['c1', 'p1', 3]]);
    });

    it('shows the stock error when there is not enough stock', async () => {
        const agent = await signIn(
            fakeBasket({
                async setQuantity() {
                    throw new BasketError(409, 'Not enough stock. Only 4 available.');
                },
            }),
        );
        const token = extractToken((await agent.get('/basket')).text);

        const res = await agent
            .post('/basket/items/p1/update')
            .type('form')
            .send({ _csrf: token, quantity: '9' });

        expect(res.status).toBe(409);
        expect(res.text).toContain('Not enough stock. Only 4 available.');
    });

    it('rejects an invalid quantity without calling the service', async () => {
        const calls: unknown[][] = [];
        const agent = await signIn(
            fakeBasket({
                async setQuantity(...args) {
                    calls.push(args);
                },
            }),
        );
        const token = extractToken((await agent.get('/basket')).text);

        const res = await agent
            .post('/basket/items/p1/update')
            .type('form')
            .send({ _csrf: token, quantity: 'abc' });

        expect(res.status).toBe(400);
        expect(calls).toEqual([]);
    });

    it('removes an item and redirects back to the basket', async () => {
        const calls: unknown[][] = [];
        const agent = await signIn(
            fakeBasket({
                async removeItem(...args) {
                    calls.push(args);
                },
            }),
        );
        const token = extractToken((await agent.get('/basket')).text);

        const res = await agent
            .post('/basket/items/p1/remove')
            .type('form')
            .send({ _csrf: token });

        expect(res.status).toBe(302);
        expect(calls).toEqual([['c1', 'p1']]);
    });
});
