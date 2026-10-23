import { getProducts } from './services/catalogue.js'

const grid = document.querySelector('#product-grid')
const loading = document.querySelector('#loading-state')
const empty = document.querySelector('#empty-state')
const error = document.querySelector('#error-state')
const count = document.querySelector('#product-count')
const results = document.querySelector('#catalogue-results')
const template = document.querySelector('#product-template')
const retry = document.querySelector('#retry-products')
const placeholder = '/assets/images/placeholder.svg'

function createCard(product, index) {
  const card = template.content.firstElementChild.cloneNode(true)
  card.classList.add(`product-tone-${index % 6}`)
  card.querySelector('.product-name').textContent = product.name
  card.querySelector('.product-category').textContent = product.category
  card.querySelector('.product-price').textContent = new Intl.NumberFormat('en-GB', {
    style: 'currency', currency: product.currency,
  }).format(product.price)
  const image = card.querySelector('img')
  image.alt = product.imageUrl ? product.name : `Image unavailable for ${product.name}`
  image.addEventListener('error', () => {
    image.alt = `Image unavailable for ${product.name}`
    image.src = placeholder
  }, { once: true })
  image.src = product.imageUrl || placeholder
  const stock = card.querySelector('.stock-label')
  stock.hidden = !product.stockStatus
  stock.textContent = product.stockStatus || ''
  stock.classList.add(product.stockStatus === 'Out of stock' ? 'unavailable' : 'available')
  return card
}

async function loadProducts() {
  results.setAttribute('aria-busy', 'true')
  grid.replaceChildren()
  count.textContent = ''
  loading.hidden = false
  empty.hidden = true
  error.hidden = true
  retry.disabled = true
  try {
    const scenario = new URLSearchParams(location.search).get('catalogue') || 'default'
    const products = await getProducts({ scenario })
    const cards = products.map(createCard)
    grid.replaceChildren(...cards)
    empty.hidden = products.length !== 0
    count.textContent = `${products.length} ${products.length === 1 ? 'product' : 'products'}`
  } catch (cause) {
    console.error('Unable to load the home catalogue:', cause)
    grid.replaceChildren()
    count.textContent = ''
    error.hidden = false
  } finally {
    loading.hidden = true
    retry.disabled = false
    results.setAttribute('aria-busy', 'false')
  }
}

retry.addEventListener('click', loadProducts)
loadProducts()
