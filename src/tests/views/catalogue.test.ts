import nunjucks from 'nunjucks'
import { describe, expect, it } from 'vitest'
import type { ProductWithPrice } from '../../models/product'

const environment = nunjucks.configure('views', { autoescape: true })
const category = {
  categoryID: 'c1',
  name: 'Home',
  label: 'Home',
  description: null,
  departmentID: 'd1',
}
const product: ProductWithPrice = {
  productID: 'p1',
  name: '<Mug & tray>',
  description: 'Everyday essentials',
  quantity: 3,
  weight: 1,
  visible: true,
  draft: false,
  deletedAt: null,
  salesNo: 0,
  categories: [category],
  departments: [],
  currentPrice: '18.00',
  productImages: [
    {
      imageID: 'i1',
      productID: 'p1',
      imageUrl: '/images/mug.svg',
      imageOrder: 0,
    },
  ],
}

function render(context: object = {}) {
  return environment.render('products/index.njk', {
    products: [product],
    categories: [category],
    currentPath: '/products',
    ...context,
  })
}

describe('catalogue presentation', () => {
  it('uses the shared layout once and limits the design stylesheet to the catalogue', () => {
    const html = render()
    expect(html.match(/<header\b/g)).toHaveLength(1)
    expect(html.match(/id="site-menu"/g)).toHaveLength(1)
    expect(html.match(/<h1\b/g)).toHaveLength(1)
    expect(html).toContain('<main id="main" class="catalogue">')
    expect(html).toContain('href="/static/catalogue.css"')
    expect(html).toContain('src="/static/theme.js"')
    const detail = environment.render('products/show.njk', { product })
    expect(detail).not.toContain('href="/static/catalogue.css"')
    expect(detail).not.toContain('class="catalogue"')
  })

  it('retains the two existing GET forms, labels, buttons and filter values', () => {
    const html = render({
      searchQuery: 'mug & tray',
      categoryFilter: 'c1',
      selectedCategory: category,
    })
    expect(html.match(/role="search"/g)).toHaveLength(2)
    expect(html.match(/method="get" action="\/products"/g)).toHaveLength(2)
    expect(html).toContain('name="q" value="mug &amp; tray"')
    expect(html).toContain('type="hidden" name="category" value="c1"')
    expect(html).toContain('<option value="c1" selected>Home</option>')
    expect(html).toContain(
      '<label for="product-name-search">Search products</label>',
    )
    expect(html).toContain('<label for="category-search">Category</label>')
    expect(html).toContain(
      '<button type="submit" class="button">Search</button>',
    )
    expect(html).toContain(
      '<button type="submit" class="button">Filter products</button>',
    )
    expect(html).toContain('href="/products">Clear search</a>')
  })

  it('preserves escaped product names, image URLs, stock, price and navigation', () => {
    const html = render()
    expect(html).toContain('&lt;Mug &amp; tray&gt;')
    expect(html).not.toContain('<Mug & tray>')
    expect(html).toContain('src="/images/mug.svg"')
    expect(html).toContain('class="product__link" href="/products/p1"')
    expect(html).toContain('<span class="stock stock--in">In stock</span>')
    expect(html).toContain('<p class="product__price">£18.00</p>')
  })

  it('retains unavailable product states and the existing empty-search message', () => {
    const unavailable = render({
      products: [
        { ...product, productImages: [], quantity: 0, currentPrice: null },
      ],
    })
    expect(unavailable).toContain('No image available')
    expect(unavailable).toContain('Out of stock')
    expect(unavailable).toContain('Price unavailable')
    const empty = render({ products: [], searchQuery: 'missing' })
    expect(empty).toContain('0 products found for &ldquo;missing&rdquo;.')
    expect(empty).toContain('No products match your search.')
    expect(empty).not.toContain('href="/products/p1"')
  })
})
