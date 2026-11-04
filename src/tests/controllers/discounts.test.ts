import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app';
import type { Discount } from '../../models/discount';

const today = new Date().toISOString().slice(0, 10);
const day = (offset: number) =>
  new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

const discounts: Discount[] = [
  {
    discountID: 'a1',
    code: 'LIVE10',
    type: 'PERCENTAGE',
    value: '10',
    expiryDate: `${day(30)}T00:00:00.000Z`,
  },
  {
    discountID: 'b2',
    code: 'OLD5',
    type: 'AMOUNT_OFF',
    value: '5',
    expiryDate: `${day(-5)}T00:00:00.000Z`,
  },
  {
    discountID: 'c3',
    code: 'TODAY',
    type: 'PERCENTAGE',
    value: '15',
    expiryDate: `${today}T00:00:00.000Z`,
  },
];

function extractToken(html: string): string {
  const match = /name="_csrf" value="([^"]+)"/.exec(html);
  if (!match?.[1]) throw new Error('CSRF token not found');
  return match[1];
}

function setup() {
  const activateDiscount = vi.fn(async () => {});
  const deactivateDiscount = vi.fn(async () => {});
  const agent = request.agent(
    createApp({
      fetchDiscounts: async () => discounts,
      activateDiscount,
      deactivateDiscount,
    }),
  );
  return { agent, activateDiscount, deactivateDiscount };
}

describe('discount activation', () => {
  it('shows Deactivate for active and Activate for expired discounts', async () => {
    const { agent } = setup();
    const res = await agent.get('/discounts');
    expect(res.text).toContain('action="/discounts/a1/deactivate"');
    expect(res.text).toContain('href="/discounts/b2/activate"');
    expect(res.text).toContain('href="/discounts/c3/activate"');
    expect(res.text).not.toContain('/discounts/c3/deactivate');
    expect(res.text).not.toContain('>Edit<');
    expect(res.text).not.toContain('>Delete<');
  });

  it('deactivating calls the backend deactivate endpoint', async () => {
    const { agent, deactivateDiscount } = setup();
    const token = extractToken((await agent.get('/discounts')).text);
    const res = await agent
      .post('/discounts/a1/deactivate')
      .type('form')
      .send({ _csrf: token });
    expect(res.status).toBe(303);
    expect(deactivateDiscount).toHaveBeenCalledWith(undefined, 'a1');
  });

  it('prompts for a new expiry date and saves it', async () => {
    const { agent, activateDiscount } = setup();
    const page = await agent.get('/discounts/b2/activate');
    expect(page.text).toContain('name="expiryDate"');
    const res = await agent
      .post('/discounts/b2/activate')
      .type('form')
      .send({ _csrf: extractToken(page.text), expiryDate: day(10) });
    expect(res.status).toBe(303);
    expect(activateDiscount).toHaveBeenCalledWith(undefined, 'b2', day(10));
  });

  it.each([day(-1), today, ''])(
    'rejects activation date %s',
    async (expiryDate) => {
      const { agent, activateDiscount } = setup();
      const page = await agent.get('/discounts/b2/activate');
      const res = await agent
        .post('/discounts/b2/activate')
        .type('form')
        .send({ _csrf: extractToken(page.text), expiryDate });
      expect(res.status).toBe(400);
      expect(activateDiscount).not.toHaveBeenCalled();
    },
  );
});
