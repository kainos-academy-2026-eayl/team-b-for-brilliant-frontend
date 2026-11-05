import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app';
import type { TokenClient } from '../../clients/tokenClient';
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

const adminTokenClient: TokenClient = {
  getIdentity: async () => ({ customerId: 'admin-1', accessLevel: 1 }),
  logout: async () => {},
};

function setup() {
  const activateDiscount = vi.fn(async () => {});
  const deactivateDiscount = vi.fn(async () => {});
  const agent = request.agent(
    createApp({
      fetchDiscounts: async () => discounts,
      activateDiscount,
      deactivateDiscount,
      tokenClient: adminTokenClient,
    }),
  );
  agent.set('Cookie', 'access_token=admin-token');
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
    expect(deactivateDiscount).toHaveBeenCalledWith('admin-token', 'a1');
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
    expect(activateDiscount).toHaveBeenCalledWith('admin-token', 'b2', day(10));
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

describe('discounts access control', () => {
  it('redirects anonymous users to the normal login page', async () => {
    const fetchDiscounts = vi.fn(async () => discounts);
    const res = await request(createApp({ fetchDiscounts })).get('/discounts');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login?returnTo=%2Fdiscounts');
    expect(fetchDiscounts).not.toHaveBeenCalled();
  });

  it('returns 403 for signed-in customers', async () => {
    const fetchDiscounts = vi.fn(async () => discounts);
    const tokenClient: TokenClient = {
      getIdentity: async () => ({ customerId: 'c1', accessLevel: 0 }),
      logout: async () => {},
    };
    const res = await request(createApp({ fetchDiscounts, tokenClient }))
      .get('/discounts')
      .set('Cookie', 'access_token=some-token');
    expect(res.status).toBe(403);
    expect(res.text).not.toContain('/admin/login');
    expect(fetchDiscounts).not.toHaveBeenCalled();
  });

  it('shows the Discounts menu link to admins', async () => {
    const { agent } = setup();
    expect((await agent.get('/discounts')).text).toContain('>Discounts</a>');
  });

  it('shows the hamburger menu with Discounts on the admin account page', async () => {
    const { agent } = setup();
    const res = await agent.get('/admin/account');
    expect(res.status).toBe(200);
    expect(res.text).toContain('id="site-menu"');
    expect(res.text).toContain('href="/discounts"');
    expect(res.text).toContain('class="admin-badge"');
  });

  it('shows an admin badge to admins only', async () => {
    const { agent } = setup();
    expect((await agent.get('/discounts')).text).toContain('class="admin-badge"');
    const customer = request.agent(createApp({
      tokenClient: { getIdentity: async () => ({ customerId: 'c1', accessLevel: 0 }), logout: async () => {} },
      fetchProducts: async () => [],
    }));
    customer.set('Cookie', 'access_token=t');
    const res = await customer.get('/home');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('admin-badge');
    expect(res.text).not.toContain('>Discounts</a>');
  });
});

describe('adding a discount', () => {
  it('saves using the signed-in admin access token', async () => {
    const saveDiscount = vi.fn(async () => {});
    const agent = request.agent(
      createApp({
        fetchDiscounts: async () => discounts,
        saveDiscount,
        tokenClient: adminTokenClient,
      }),
    );
    agent.set('Cookie', 'access_token=admin-token');
    const page = await agent.get('/discounts/add');
    const res = await agent
      .post('/discounts/add')
      .type('form')
      .send({
        _csrf: extractToken(page.text),
        code: 'SAVE10',
        type: 'percentage',
        value: '10',
        expiryDate: day(10),
      });
    expect(res.status).toBe(303);
    expect(saveDiscount).toHaveBeenCalledWith('admin-token', {
      code: 'SAVE10',
      type: 'percentage',
      value: '10',
      expiryDate: day(10),
    });
  });
});
