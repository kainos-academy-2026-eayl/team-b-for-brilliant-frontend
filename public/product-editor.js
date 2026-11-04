(() => {
  const editor = document.getElementById('product-editor')
  if (!editor) return

  const form = editor.querySelector('#product-edit-form')
  const editPanel = editor.querySelector('#product-edit-panel')
  const preview = editor.querySelector('#product-preview-panel')
  const editButton = editor.querySelector('#product-edit-button')
  const previewButton = editor.querySelector('#product-preview-button')
  const nameInput = form.elements.namedItem('name')
  const stockInput = form.elements.namedItem('quantity')
  const imagesInput = form.elements.namedItem('images')
  const imageList = editor.querySelector('#product-image-list')
  const imageError = editor.querySelector('#edit-product-images-error')
  const imageStatus = editor.querySelector('#product-image-status')
  const mainImage = preview.querySelector('#product-main-image')
  const thumbnails = preview.querySelector('.product-detail__thumbnails')
  const images = [...imageList.querySelectorAll('[data-image-id]')]
    .map((item) => ({
      imageID: item.dataset.imageId,
      src: item.querySelector('img').getAttribute('src'),
      name: item.dataset.imageName,
    }))
  let saving = false

  function releaseTemporaryImages() {
    for (const image of images) {
      if (image.file) URL.revokeObjectURL(image.src)
    }
  }

  function renderImageList() {
    imageList.replaceChildren()
    images.forEach((image, index) => {
      const item = document.createElement('li')
      const thumbnail = document.createElement('img')
      thumbnail.src = image.src
      thumbnail.alt = image.name
      thumbnail.width = 80
      thumbnail.height = 80
      const label = document.createElement('p')
      label.className = 'product-editor__image-label'
      label.tabIndex = -1
      label.textContent = `Image ${index + 1}${index === 0 ? ' (main image)' : ''}: ${image.name}`
      const actions = document.createElement('div')
      actions.className = 'product-editor__image-actions'
      for (const [action, text] of [['earlier', 'Move earlier'], ['later', 'Move later'], ['remove', 'Remove']]) {
        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'button button-link'
        button.textContent = text
        button.dataset.imageAction = action
        button.dataset.imageIndex = String(index)
        button.setAttribute('aria-label', action === 'remove'
          ? `Remove image ${index + 1}` : `Move image ${index + 1} ${action}`)
        button.disabled = saving || (action === 'earlier' && index === 0) ||
          (action === 'later' && index === images.length - 1)
        actions.append(button)
      }
      item.append(thumbnail, label, actions)
      imageList.append(item)
    })
    imageStatus.textContent = images.length
      ? `${images.length} image${images.length === 1 ? '' : 's'} selected. Image 1 is the main product image.`
      : 'No images selected. Customers will see "No image available".'
  }

  function updateImages(name) {
    const count = images.length
    preview.querySelector('.product-detail__images')
      .classList.toggle('product-detail__images--gallery', count > 1)
    mainImage.parentElement.classList.toggle('product-detail__main-image', count > 0)
    mainImage.hidden = count === 0
    preview.querySelector('[data-product-no-image]').hidden = count > 0
    thumbnails.hidden = count <= 1
    thumbnails.replaceChildren()
    if (count === 0) {
      mainImage.removeAttribute('src')
      return
    }
    mainImage.src = images[0].src
    mainImage.alt = count > 1 ? `${name} - image 1 of ${count}` : name
    if (count <= 1) return
    images.forEach(({ src: url }, index) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'product-detail__thumbnail'
      button.setAttribute('aria-label', `View image ${index + 1} of ${count} for ${name}`)
      button.setAttribute('aria-controls', 'product-main-image')
      button.setAttribute('aria-pressed', String(index === 0))
      button.dataset.imageSrc = url
      button.dataset.imageAlt = `${name} - image ${index + 1} of ${count}`
      const image = document.createElement('img')
      image.src = url
      image.alt = ''
      button.append(image)
      thumbnails.append(button)
    })
  }

  function updateCategories() {
    const selected = [...form.querySelectorAll('[data-product-category]:checked')]
    const categories = preview.querySelector('[data-product-categories]')
    const groups = new Map()
    for (const input of selected) {
      const { departmentId, departmentName, categoryName } = input.dataset
      if (!groups.has(departmentId)) {
        const heading = document.createElement('dt')
        heading.textContent = departmentName
        const detail = document.createElement('dd')
        const list = document.createElement('ul')
        detail.append(list)
        groups.set(departmentId, { heading, detail, list })
      }
      const item = document.createElement('li')
      item.textContent = categoryName
      groups.get(departmentId).list.append(item)
    }
    categories.replaceChildren()
    for (const { heading, detail } of groups.values()) categories.append(heading, detail)
    categories.hidden = selected.length === 0
    preview.querySelector('[data-product-categories-heading]').hidden = selected.length === 0
    const departments = preview.querySelector('[data-product-departments]')
    departments.hidden = selected.length > 0 || departments.querySelectorAll('li').length === 0
  }

  function showPreview() {
    nameInput.setCustomValidity(nameInput.value.trim() ? '' : 'Enter a product name.')
    const stock = Number(stockInput.value)
    stockInput.setCustomValidity(Number.isSafeInteger(stock) && stock >= 0
      ? '' : 'Enter a whole stock quantity of zero or more.')
    if (!form.reportValidity()) return

    const name = nameInput.value.trim()
    preview.querySelector('[data-product-name]').textContent = name
    const price = form.elements.namedItem('price').value
    const priceElement = preview.querySelector('[data-product-price]')
    priceElement.textContent = price ? `£${Number(price).toFixed(2)}` : 'Price unavailable'
    priceElement.classList.toggle('product__price--unavailable', !price)
    const inStock = stock > 0
    const stockElement = preview.querySelector('[data-product-stock]')
    stockElement.textContent = inStock ? 'In stock' : 'Out of stock'
    stockElement.classList.toggle('stock--in', inStock)
    stockElement.classList.toggle('stock--out', !inStock)
    const quantity = preview.querySelector('#product-quantity')
    quantity.replaceChildren()
    for (let value = inStock ? 1 : 0; value <= (inStock ? Math.min(stock, 10) : 0); value++) {
      const option = document.createElement('option')
      option.value = String(value)
      option.textContent = String(value)
      quantity.append(option)
    }
    quantity.disabled = !inStock
    preview.querySelector('.product-detail__basket .button').disabled = !inStock
    const description = form.elements.namedItem('description').value.trim()
    const descriptionElement = preview.querySelector('.product-detail__description')
    descriptionElement.textContent = description
    descriptionElement.hidden = !description
    preview.querySelector('[data-product-description-heading]').hidden = !description
    const draft = form.elements.namedItem('publication').value === 'draft'
    editor.querySelector('#product-publication-status').textContent = draft
      ? 'This is a draft. Only admins can see it until it is made visible to customers.'
      : 'Unsaved customer preview. Preview controls do not make purchases.'
    updateCategories()
    updateImages(name)
    editPanel.hidden = true
    preview.hidden = false
    editButton.setAttribute('aria-pressed', 'false')
    previewButton.setAttribute('aria-pressed', 'true')
    preview.querySelector('[data-product-name]').focus()
  }

  editButton.addEventListener('click', () => {
    preview.hidden = true
    editPanel.hidden = false
    editButton.setAttribute('aria-pressed', 'true')
    previewButton.setAttribute('aria-pressed', 'false')
    editor.querySelector('#product-edit-heading').focus()
  })
  previewButton.addEventListener('click', showPreview)
  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    nameInput.setCustomValidity(nameInput.value.trim() ? '' : 'Enter a product name.')
    if (!form.reportValidity()) return
    const saveButton = editor.querySelector('#product-save-button')
    const saveError = editor.querySelector('#product-save-error')
    const saveStatus = editor.querySelector('#product-save-status')
    if (saving) return
    saving = true
    saveButton.disabled = true
    imagesInput.disabled = true
    renderImageList()
    saveError.hidden = true
    saveStatus.textContent = 'Saving product changes...'
    try {
      const data = new FormData(form)
      const payload = Object.fromEntries(data)
      payload.categoryIDs = data.getAll('categoryIDs')
      delete payload.images
      payload.images = await Promise.all(images.map(async (image) => {
        if (image.imageID) return { imageID: image.imageID }
        const file = image.file
        const bytes = new Uint8Array(await file.arrayBuffer())
        let binary = ''
        for (let offset = 0; offset < bytes.length; offset += 8192) {
          binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192))
        }
        return { contentType: file.type, data: btoa(binary) }
      }))
      const response = await fetch(form.action, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!response.headers.get('content-type')?.includes('application/json')) {
        throw new Error('Your sign-in may have expired. Reload the page and sign in again before saving.')
      }
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Product changes could not be saved.')
      if (typeof result.redirect !== 'string') throw new Error('The save response was invalid. Reload to check the product.')
      window.location.assign(result.redirect)
    } catch (error) {
      console.error('Product save failed', error)
      saveError.textContent = error.message
      saveError.hidden = false
      saveError.setAttribute('tabindex', '-1')
      saveError.focus()
      saveStatus.textContent = ''
      saving = false
      saveButton.disabled = false
      imagesInput.disabled = false
      renderImageList()
    }
  })
  nameInput.addEventListener('input', () => nameInput.setCustomValidity(''))
  stockInput.addEventListener('input', () => stockInput.setCustomValidity(''))
  imagesInput.addEventListener('change', () => {
    if (saving) return
    const files = [...imagesInput.files]
    imagesInput.value = ''
    if (!files.length) return
    const totalBytes = images.reduce((total, image) => total + (image.file?.size ?? 0), 0) +
      files.reduce((total, file) => total + file.size, 0)
    const invalid = images.length + files.length > 5 || totalBytes > 5 * 1024 * 1024 ||
      files.some((file) => !['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(file.type))
    const message = invalid ? 'Images were not added. Keep up to five images in total, with new PNG, JPEG, GIF or WebP uploads totalling 5 MB or less.' : ''
    imagesInput.setAttribute('aria-invalid', String(invalid))
    imageError.textContent = message
    if (invalid) return
    images.push(...files.map((file) => ({ file, src: URL.createObjectURL(file), name: file.name })))
    renderImageList()
  })
  imageList.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-image-action]')
    if (!button || saving) return
    const index = Number(button.dataset.imageIndex)
    const action = button.dataset.imageAction
    let nextIndex = index
    if (action === 'remove') {
      const [removed] = images.splice(index, 1)
      if (removed.file) URL.revokeObjectURL(removed.src)
      nextIndex = Math.min(index, images.length - 1)
    } else {
      nextIndex = action === 'earlier' ? index - 1 : index + 1
      const [moved] = images.splice(index, 1)
      images.splice(nextIndex, 0, moved)
    }
    imageError.textContent = ''
    imagesInput.removeAttribute('aria-invalid')
    renderImageList()
    imageStatus.textContent = action === 'remove'
      ? `Image removed. ${images.length} image${images.length === 1 ? '' : 's'} remaining.`
      : `Image moved to position ${nextIndex + 1}${nextIndex === 0 ? ' and is now the main product image' : ''}.`
    const target = imageList.querySelector(`[data-image-index="${nextIndex}"][data-image-action="${action}"]`)
    const fallback = imageList.querySelector(`[data-image-index="${nextIndex}"][data-image-action="remove"]`)
    if (target && !target.disabled) target.focus()
    else if (action !== 'remove') imageList.children[nextIndex].querySelector('.product-editor__image-label').focus()
    else if (fallback) fallback.focus()
    else imagesInput.focus()
  })
  preview.addEventListener('click', (event) => {
    const button = event.target.closest('.product-detail__thumbnail')
    if (!button) return
    mainImage.src = button.dataset.imageSrc
    mainImage.alt = button.dataset.imageAlt
    for (const thumbnail of thumbnails.children) {
      thumbnail.setAttribute('aria-pressed', String(thumbnail === button))
    }
  })
  window.addEventListener('pagehide', (event) => {
    if (!event.persisted) releaseTemporaryImages()
  })
  editor.querySelector('#product-editor-modes').hidden = false
  imagesInput.disabled = false
  renderImageList()
})()
