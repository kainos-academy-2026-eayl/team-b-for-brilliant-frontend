import { describe, expect, it, vi } from 'vitest';
import { CategoriesLoadError, getCategories } from '../../services/categories';

const category = {
  categoryID: 'unused-category', name: 'Existing category', description: null,
  departmentID: 'department-1', departmentName: 'Beauty',
};

describe('database category API client', () => {
  it('fetches all category choices with the verified admin token', async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => Response.json({ categories: [category] }));
    expect(await getCategories('admin-token', 'http://backend.test', fetchFn)).toEqual([category]);
    expect(String(fetchFn.mock.calls[0]?.[0])).toBe('http://backend.test/categories');
    expect(fetchFn.mock.calls[0]?.[1]).toMatchObject({
      headers: { Authorization: 'Bearer admin-token' }, cache: 'no-store',
    });
  });

  it.each([401, 403, 500])('surfaces HTTP %s failures instead of an empty category list', async (status) => {
    const fetchFn = vi.fn<typeof fetch>(async () => new Response('', { status }));
    await expect(getCategories('token', 'http://backend.test', fetchFn)).rejects.toEqual(new CategoriesLoadError(status));
  });

  it('rejects malformed backend category data', async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => Response.json({ categories: [{ name: 'Missing ID' }] }));
    await expect(getCategories('token', 'http://backend.test', fetchFn)).rejects.toThrow();
  });
});
