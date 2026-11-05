const imageInput = document.getElementById('images')
const orderInput = document.getElementById('image-order')
const panel = document.getElementById('image-order-panel')
const list = document.getElementById('image-order-list')
const status = document.getElementById('image-order-status')

if (imageInput && orderInput && panel && list && status) {
  let images = []
  let selectedPreviewImageIndex = null
  const productPreview = document.getElementById('product-preview')

  function updateProductPreview() {
    if (!productPreview) return
    const name = document.getElementById('name').value.trim() || 'Product name'
    const description = document.getElementById('description').value.trim()
    const price = document.getElementById('price').value.trim()
    const quantity = document.getElementById('quantity').value.trim()
    const draft = document.getElementById('draft').value
    const validPrice = /^\d{1,8}(?:\.\d{1,2})?$/.test(price)
    const validQuantity = /^\d+$/.test(quantity) && Number.isInteger(Number(quantity)) &&
      Number(quantity) <= 2147483647
    const inStock = validQuantity && Number(quantity) > 0
    const previewPrice = document.getElementById('product-preview-price')
    const previewStock = document.getElementById('product-preview-stock')
    const previewImage = document.getElementById('product-preview-image')
    const imagePlaceholder = document.getElementById('product-preview-image-placeholder')
    const selectedImage = images.find((image) => image.index === selectedPreviewImageIndex) || images[0]
    selectedPreviewImageIndex = selectedImage?.index ?? null
    const selectedPosition = images.indexOf(selectedImage)

    document.getElementById('product-preview-name').textContent = name
    previewPrice.textContent = validPrice ? `\u00a3${Number(price).toFixed(2)}` : 'Price unavailable'
    previewPrice.classList.toggle('product__price--unavailable', !validPrice)
    previewStock.hidden = !validQuantity
    previewStock.textContent = inStock ? 'In stock' : 'Out of stock'
    previewStock.classList.toggle('stock--in', inStock)
    previewStock.classList.toggle('stock--out', validQuantity && !inStock)
    const previewQuantity = document.getElementById('product-preview-quantity')
    const previousQuantity = Number(previewQuantity.value)
    const maxQuantity = inStock ? Math.min(Number(quantity), 10) : 0
    previewQuantity.replaceChildren()
    for (let value = inStock ? 1 : 0; value <= maxQuantity; value++) {
      const option = document.createElement('option')
      option.value = String(value)
      option.textContent = String(value)
      previewQuantity.append(option)
    }
    previewQuantity.value = inStock
      ? String(Number.isInteger(previousQuantity) && previousQuantity >= 1 && previousQuantity <= maxQuantity ? previousQuantity : 1)
      : '0'
    previewQuantity.disabled = !inStock
    document.getElementById('product-preview-basket').disabled = !inStock
    document.getElementById('product-preview-visibility').textContent = draft === 'true'
      ? 'Draft - hidden from the shop'
      : draft === 'false' ? 'Visible in the shop' : 'Select a draft status.'
    document.getElementById('product-preview-description-section').hidden = !description
    document.getElementById('product-preview-description').textContent = description
    const selectedCategories = imageInput.form.querySelectorAll('input[name="categoryIDs"]:checked')
    const previewCategories = document.getElementById('product-preview-categories')
    previewCategories.replaceChildren()
    document.getElementById('product-preview-categories-section').hidden = selectedCategories.length === 0
    const departments = new Map()
    for (const category of selectedCategories) {
      const { departmentId, departmentName, categoryName } = category.dataset
      if (departmentId === undefined || departmentName === undefined || categoryName === undefined) {
        throw new Error('Category preview metadata is missing')
      }
      if (!departments.has(departmentId)) departments.set(departmentId, { name: departmentName, categories: [] })
      departments.get(departmentId).categories.push(categoryName)
    }
    for (const department of departments.values()) {
      const term = document.createElement('dt')
      term.textContent = department.name
      const definition = document.createElement('dd')
      const categoryList = document.createElement('ul')
      for (const name of department.categories) {
        const item = document.createElement('li')
        item.textContent = name
        categoryList.append(item)
      }
      definition.append(categoryList)
      previewCategories.append(term, definition)
    }
    previewImage.alt = `${name}${images.length > 1 ? ` - image ${selectedPosition + 1} of ${images.length}` : ''}`
    document.getElementById('product-preview-image-frame').classList.toggle('product-detail__main-image', images.length > 0)
    if (selectedImage) {
      if (previewImage.getAttribute('src') !== selectedImage.url) {
        previewImage.src = selectedImage.url
        previewImage.hidden = false
        imagePlaceholder.hidden = true
      }
    } else {
      previewImage.removeAttribute('src')
      previewImage.hidden = true
      imagePlaceholder.hidden = false
    }
    Array.from(document.getElementById('product-preview-thumbnails').children).forEach((button, position) => {
      button.setAttribute('aria-label', `View image ${position + 1} of ${images.length} for ${name}`)
      button.setAttribute('aria-pressed', String(images[position].index === selectedPreviewImageIndex))
    })
  }

  function renderPreviewGallery() {
    if (!productPreview) return
    const thumbnails = document.getElementById('product-preview-thumbnails')
    thumbnails.replaceChildren()
    thumbnails.hidden = images.length < 2
    document.getElementById('product-preview-gallery').classList.toggle('product-detail__images--gallery', images.length > 1)
    if (images.length < 2) return
    for (const image of images) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'product-detail__thumbnail'
      button.setAttribute('aria-controls', 'product-preview-image')
      const thumbnail = document.createElement('img')
      thumbnail.src = image.url
      thumbnail.alt = ''
      button.append(thumbnail)
      button.addEventListener('click', () => {
        selectedPreviewImageIndex = image.index
        updateProductPreview()
      })
      thumbnails.append(button)
    }
  }

  function render(focusIndex, focusDirection) {
    selectedPreviewImageIndex = null
    list.replaceChildren()
    orderInput.value = JSON.stringify(images.map((image) => image.index))
    panel.hidden = images.length === 0

    images.forEach((image, position) => {
      const item = document.createElement('li')
      item.className = 'image-order__item'
      const preview = document.createElement('img')
      preview.src = image.url
      preview.alt = ''
      preview.className = 'image-order__preview'
      const unavailable = document.createElement('p')
      unavailable.className = 'form-message'
      unavailable.textContent = 'Preview unavailable. This file may not be a valid image.'
      unavailable.hidden = true
      preview.addEventListener('error', () => {
        preview.hidden = true
        unavailable.hidden = false
      })
      const label = document.createElement('p')
      label.className = 'image-order__name'
      label.textContent = `${image.file.name}${position === 0 ? ' (main image)' : ''}`
      const controls = document.createElement('div')
      controls.className = 'image-order__controls'
      const buttons = []

      for (const [direction, offset] of [['up', -1], ['down', 1]]) {
        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'button'
        button.textContent = `Move ${direction}`
        button.setAttribute('aria-label', `Move ${image.file.name} ${direction} from position ${position + 1}`)
        button.disabled = position + offset < 0 || position + offset >= images.length
        button.addEventListener('click', () => {
          const next = position + offset
          images[position] = images[next]
          images[next] = image
          render(image.index, direction)
          status.textContent = `${image.file.name} moved to position ${next + 1} of ${images.length}.${next === 0 ? ' This is now the main image.' : ''}`
        })
        buttons.push(button)
        controls.append(button)
      }
      item.append(preview, unavailable, label, controls)
      list.append(item)
      if (image.index === focusIndex) {
        const preferred = buttons[focusDirection === 'up' ? 0 : 1]
        const focusTarget = preferred.disabled ? buttons.find((button) => !button.disabled) : preferred
        focusTarget?.focus()
      }
    })
    renderPreviewGallery()
    updateProductPreview()
  }

  imageInput.addEventListener('change', () => {
    for (const image of images) URL.revokeObjectURL(image.url)
    images = Array.from(imageInput.files).map((file, index) => ({
      file, index, url: URL.createObjectURL(file),
    }))
    render()
    status.textContent = images.length === 0
      ? 'No images selected.'
      : `${images.length} image${images.length === 1 ? '' : 's'} selected.${images.length > 5 ? ' Choose no more than 5 images.' : ' The first image is the main image.'}`
  })

  if (productPreview) {
    document.getElementById('product-preview-image').addEventListener('error', () => {
      document.getElementById('product-preview-image').hidden = true
      document.getElementById('product-preview-image-placeholder').hidden = false
    })
    imageInput.form.addEventListener('input', updateProductPreview)
    imageInput.form.addEventListener('change', updateProductPreview)
    updateProductPreview()
    const views = [
      { tab: document.getElementById('product-details-tab'), panel: document.getElementById('product-create-form') },
      { tab: document.getElementById('product-preview-tab'), panel: productPreview },
    ]
    function activateView(selectedIndex, focusTab = false) {
      if (selectedIndex === 1) updateProductPreview()
      views.forEach(({ tab, panel }, index) => {
        const selected = index === selectedIndex
        tab.setAttribute('aria-selected', String(selected))
        tab.tabIndex = selected ? 0 : -1
        panel.hidden = !selected
      })
      if (focusTab) views[selectedIndex].tab.focus()
    }
    views.forEach(({ tab, panel }, index) => {
      panel.setAttribute('role', 'tabpanel')
      panel.setAttribute('aria-labelledby', tab.id)
      panel.setAttribute('tabindex', '0')
      tab.addEventListener('click', () => activateView(index))
      tab.addEventListener('keydown', (event) => {
        let next
        if (event.key === 'ArrowRight') next = (index + 1) % views.length
        else if (event.key === 'ArrowLeft') next = (index + views.length - 1) % views.length
        else if (event.key === 'Home') next = 0
        else if (event.key === 'End') next = views.length - 1
        else return
        event.preventDefault()
        activateView(next, true)
      })
    })
    activateView(0)
    document.getElementById('product-editor-tabs').hidden = false
  }
  if (imageInput.files.length) imageInput.dispatchEvent(new Event('change'))
}
