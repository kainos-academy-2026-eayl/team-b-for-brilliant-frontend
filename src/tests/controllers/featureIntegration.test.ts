import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createTestApp } from '../helpers/createTestApp';
import { stubProfileService } from '../helpers/stubProfileService';
import type { BasketService } from '../../services/basket';
import type { CheckoutService } from '../../services/checkout';

describe('checkout retained alongside product creation', () => {
  it('keeps the checkout route authenticated and handles an empty customer basket', async () => {
    const basketService: BasketService = {
      getBasket: vi.fn(async () => ({ items: [], notices: [] })),
      async addItem() { throw new Error('Not used'); },
      async setQuantity() { throw new Error('Not used'); },
      async removeItem() { throw new Error('Not used'); },
    };
    const checkoutService: CheckoutService = {
      getQuote: vi.fn(async () => { throw new Error('An empty basket must not be quoted'); }),
      placeOrder: vi.fn(async () => { throw new Error('This test must not place an order'); }),
    };
    const app = createTestApp({
      basketService, checkoutService, profileService: stubProfileService,
      accountClient: {
        async verifyCredentials() {
          return { status: 'valid', customerId: 'customer-1', accessToken: 'checkout-token' };
        },
        async uniqueEmail() { throw new Error('Not used'); },
        async register() { throw new Error('Not used'); },
      },
    });
    const agent = request.agent(app);
    await agent.get('/checkout').expect(302).expect('Location', '/login?returnTo=%2Fcheckout');
    const login = await agent.get('/login').expect(200);
    const csrf = /name="_csrf" value="([^"]+)"/.exec(login.text)?.[1];
    if (!csrf) throw new Error('CSRF token not found');
    await agent.post('/login').type('form')
      .send({ _csrf: csrf, email: 'customer@example.com', password: 'correct' }).expect(302);
    await agent.get('/checkout').expect(302).expect('Location', '/basket');
    expect(basketService.getBasket).toHaveBeenCalledWith('checkout-token');
    expect(checkoutService.getQuote).not.toHaveBeenCalled();
    expect(checkoutService.placeOrder).not.toHaveBeenCalled();
  });
});
