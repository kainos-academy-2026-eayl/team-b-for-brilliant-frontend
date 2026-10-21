import assert from 'node:assert/strict'
import { once } from 'node:events'
import { after, before, test } from 'node:test'
import { createApp } from '../src/app.ts'
import { getProducts } from '../src/public/js/services/catalogue.js'

let server
let baseUrl

before(async () => {
  server = createApp().listen(0, '127.0.0.1')
  await once(server, 'listening')
  baseUrl = `http://127.0.0.1:${server.address().port}`
})

after(async () => {
  const closed = once(server, 'close')
  server.close()
  await closed
})

test('initial route renders branded catalogue shell with all result states', async () => {
  const response = await fetch(baseUrl)
  assert.equal(response.status, 200)
  const html = await response.text()
  for (const content of ['B-Brilliant', 'Never Settle for less', 'Demo catalogue',
    'id="product-grid"', 'id="loading-state"', 'id="empty-state"', 'id="error-state"',
    '/assets/js/home.js', 'Please enable JavaScript']) {
    assert.ok(html.includes(content), `Missing ${content}`)
  }
})

test('assets and health endpoint remain available', async () => {
  for (const path of ['/assets/css/main.css', '/assets/js/home.js',
    '/assets/js/services/catalogue.js', '/assets/images/placeholder.svg',
    '/assets/images/tote.svg', '/assets/images/notebook.svg', '/assets/images/mug.svg']) {
    const response = await fetch(`${baseUrl}${path}`)
    assert.equal(response.status, 200, path)
  }
  const health = await fetch(`${baseUrl}/health`)
  assert.equal((await health.json()).status, 'ok')
})

test('catalogue returns product details and isolates cached data from callers', async () => {
  const products = await getProducts()
  assert.equal(products.length, 6)
  for (const product of products) {
    assert.equal(typeof product.name, 'string')
    assert.equal(typeof product.price, 'number')
    assert.equal(product.currency, 'GBP')
  }
  assert.ok(products.some((product) => !product.imageUrl))
  assert.ok(products.some((product) => product.stockStatus === 'Out of stock'))
  products[0].name = 'Changed'
  products.pop()
  const again = await getProducts()
  assert.equal(again.length, 6)
  assert.equal(again[0].name, 'Everyday carry tote')
})

test('empty and error scenarios never reuse successful catalogue results', async () => {
  await getProducts()
  assert.deepEqual(await getProducts({ scenario: 'empty' }), [])
  await assert.rejects(getProducts({ scenario: 'error' }), /unavailable/)
})
