import nunjucks from 'nunjucks'
import { describe, expect, it } from 'vitest'
import type { ProductWithPrice } from '../../models/product'

const environment = nunjucks.configure('views', { autoescape: true })
const category = {
  categoryID: 'c1',
  name: 'Skincare',
  description: null,
  departmentID: 'd1',
}
const department = { departmentID: 'd1', name: 'Beauty', description: null }
const product: ProductWithPrice = {
  productID: 'p1',
  name: '<Example product>',
  description: 'A description & more',
  currentPrice: '12.50',
  quantity: 7,
  weight: 1.5,
  draft: false,
  visible: true,
  deletedAt: null,
  salesNo: 0,
  categories: [category],
  departments: [department],
  productImages: [
    {
      imageID: 'i1',
      productID: 'p1',
      imageUrl: '/images/example.svg',
      imageOrder: 0,
    },
  ],
}

function render(
  overrides: Partial<ProductWithPrice> = {},
  context: object = {},
) {
  return environment.render('products/edit.njk', {
    product: { ...product, ...overrides },
    ...context,
  })
}

describe('product editor template', () => {
  it('inherits one shared header, menu, theme and the customer product styles', () => {
    const html = render()
    expect(html.match(/<header\b/g)).toHaveLength(1)
    expect(html.match(/id="site-menu"/g)).toHaveLength(1)
    expect(html.match(/id="theme-switch"/g)).toHaveLength(1)
    expect(html).toContain('src="/static/theme.js"')
    expect(html).toContain('src="/static/menu.js"')
    expect(html).toContain('href="/static/product-editor.css"')
    expect(html).toContain('src="/static/product-editor.js"')
    expect(html).toContain('.product-detail__body')
  })

  it('prefills details and provides CSRF-protected saving and bounded image uploads', () => {
    const html = render()
    for (const name of [
      'name',
      'description',
      'price',
      'quantity',
      'weight',
      'publication',
      'categoryIDs',
      'images',
    ]) {
      expect(html).toContain(`name="${name}"`)
    }
    expect(html).toContain('value="12.50"')
    expect(html).toContain('value="7"')
    expect(html).toContain('value="1.5"')
    expect(html).toContain(
      'type="file" accept="image/png,image/jpeg,image/gif,image/webp" multiple disabled',
    )
    expect(html).toContain('Changes remain private until you save them.')
    expect(html).toContain('>Save changes</button>')
    expect(html).toContain('action="/products/p1/edit"')
    expect(html).toContain('name="_csrf"')
    expect(html).toContain('Enable JavaScript to use customer preview')
    expect(html).toContain('id="product-edit-heading" tabindex="-1"')
    expect(html).not.toMatch(/type="submit"[^>]*disabled/)
    expect(html).toContain(
      'id="product-editor-modes" role="group" aria-label="Product view" hidden',
    )
    expect(html).toContain(
      'id="product-preview-panel" aria-label="Customer product preview" hidden',
    )
  })

  it('uses one required radio group and preserves the submitted publication choice', () => {
    const html = render()
    expect(html).toMatch(
      /id="edit-product-visible" name="publication" type="radio" value="visible" required[^>]*checked/,
    )
    expect(html).not.toMatch(/id="edit-product-draft"[^>]*checked/)
    for (const flags of [
      { visible: false, draft: true },
      { visible: false, draft: false },
      { visible: true, draft: true },
    ]) {
      const draft = render(flags)
      expect(draft).toMatch(/id="edit-product-draft"[^>]*checked/)
      expect(draft).not.toMatch(/id="edit-product-visible"[^>]*checked/)
    }
    const failed = render(
      { visible: false, draft: true },
      { values: { publication: 'visible', categoryIDs: [] } },
    )
    expect(failed).toMatch(/id="edit-product-visible"[^>]*checked/)
    expect(failed).not.toMatch(/id="edit-product-draft"[^>]*checked/)
  })

  it('escapes product details and category data rather than rendering HTML', () => {
    const html = render(
      {},
      {
        categories: [{ ...category, name: '"><script>alert(1)</script>' }],
      },
    )
    expect(html).toContain('&lt;Example product&gt;')
    expect(html).toContain('A description &amp; more')
    expect(html).toContain('&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).not.toContain('<script>alert(1)</script>')
  })

  it('selects assigned categories while offering additional catalogue choices', () => {
    const html = render(
      {},
      {
        categories: [
          category,
          { ...category, categoryID: 'c2', name: 'Haircare' },
        ],
        departments: [department],
      },
    )
    expect(html).toMatch(/value="c1"[^>]*checked/)
    expect(html).toMatch(/value="c2"[^>]*data-department-name="Beauty">/)
    expect(html).not.toMatch(/value="c2"[^>]*checked/)
    expect(html).toContain('Haircare (Beauty)')
  })

  it('retains empty preview structures so omitted details can be added without a reload', () => {
    const html = render({
      description: null,
      currentPrice: null,
      categories: [],
      departments: [],
      productImages: [],
    })
    expect(html).toContain('data-product-description-heading hidden')
    expect(html).toContain('data-product-categories hidden')
    expect(html).toContain('id="product-main-image" hidden')
    expect(html).toContain('data-product-no-image>No image available')
    expect(html).toContain('No categories are available.')
    expect(html).not.toContain('value="null"')
  })

  it('retains existing images and gallery controls for a multiple-image preview', () => {
    const html = render({
      productImages: [
        ...product.productImages,
        {
          imageID: 'i2',
          productID: 'p1',
          imageUrl: '/images/second.svg',
          imageOrder: 1,
        },
      ],
    })
    expect(html).toContain('product-detail__images--gallery')
    expect(html.match(/class="product-detail__thumbnail"/g)).toHaveLength(2)
    expect(html).toContain('data-image-src="/images/second.svg"')
    expect(html).toContain('id="product-image-list"')
    expect(html).toContain('data-image-id="i1"')
    expect(html).toContain('data-image-id="i2"')
    expect(html).toContain('Image 1 (main image)')
    expect(html).toContain('Add images')
    expect(html).not.toContain('Use existing images')
    expect(html).not.toContain('Choose replacement images')
  })

  it('renders a CSRF-protected basket form for the customer product page', () => {
    const html = environment.render('products/detail.njk', {
      product,
      csrfToken: 'test-csrf-token',
    })
    expect(html).toContain(
      '<form method="post" action="/basket/items" class="product-detail__basket">',
    )
    expect(html).toContain('name="_csrf" value="test-csrf-token"')
    expect(html).toContain('name="productID" value="p1"')
    expect(html).toContain(
      '<button type="submit" class="button">Add to basket</button>',
    )
  })

  it('keeps preview basket controls inert and avoids adding a nested purchase form', () => {
    const preview = environment.render('products/detail.njk', {
      product,
      isProductPreview: true,
    })
    expect(preview).toContain('<div class="product-detail__basket">')
    expect(preview).toMatch(
      /<button type="button" class="button"[^>]*aria-disabled="true"[^>]*>Add to basket<\/button>/,
    )
    expect(preview).not.toContain('<form')
    expect(preview).not.toContain('name="productID"')
    const editor = render()
    expect(editor).not.toContain('action="/basket/items"')
    expect(editor.match(/<form\b/g)).toHaveLength(1)
  })

  it('shares the product article with the customer page without adding editor controls there', () => {
    const html = environment.render('products/show.njk', { product })
    const article = environment.render('products/detail.njk', { product })
    expect(html).toContain(article)
    expect(html).not.toContain('product-edit-form')
    expect(html).not.toContain('data-product-name')
    expect(html).not.toContain('/static/product-editor.js')
  })
})
