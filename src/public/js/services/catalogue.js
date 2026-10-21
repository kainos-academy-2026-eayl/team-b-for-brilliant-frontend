/** @typedef {import('../../../types/product').Product} Product */

/** @type {Product[]} */
const products = [
  { id: '1', name: 'Everyday carry tote', category: 'BAGS & ACCESSORIES', price: 24, currency: 'GBP', imageUrl: '/assets/images/tote.svg', stockStatus: 'In stock' },
  { id: '2', name: 'The daily notebook', category: 'STATIONERY', price: 12.5, currency: 'GBP', imageUrl: '/assets/images/notebook.svg', stockStatus: 'In stock' },
  { id: '3', name: 'Slow morning mug', category: 'HOME & LIVING', price: 18, currency: 'GBP', imageUrl: '/assets/images/mug.svg', stockStatus: 'In stock' },
  { id: '4', name: 'Weekend canvas tote', category: 'BAGS & ACCESSORIES', price: 32, currency: 'GBP', imageUrl: '/assets/images/tote.svg', stockStatus: 'Out of stock' },
  { id: '5', name: 'Pocket journal', category: 'STATIONERY', price: 8, currency: 'GBP', imageUrl: '/assets/images/notebook.svg', stockStatus: 'In stock' },
  { id: '6', name: 'A little surprise', category: 'EVERYDAY ESSENTIALS', price: 15, currency: 'GBP' },
]

const cache = new Map()

/**
 * Single catalogue boundary for future API/cache integration.
 * Demo scenarios are isolated so errors never return cached success data.
 * @returns {Promise<Product[]>}
 */
export async function getProducts({ scenario = 'default' } = {}) {
  if (scenario === 'error') {
    await new Promise((resolve) => setTimeout(resolve, 500))
    throw new Error('Demo catalogue is unavailable')
  }
  if (!cache.has(scenario)) {
    await new Promise((resolve) => setTimeout(resolve, scenario === 'slow' ? 4000 : 500))
    cache.set(scenario, scenario === 'empty' ? [] : products)
  }
  return cache.get(scenario).map((product) => ({ ...product }))
}
