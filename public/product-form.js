const imageInput = document.getElementById('images')
const orderInput = document.getElementById('image-order')
const panel = document.getElementById('image-order-panel')
const list = document.getElementById('image-order-list')
const status = document.getElementById('image-order-status')

if (imageInput && orderInput && panel && list && status) {
  let images = []

  function render(focusIndex, focusDirection) {
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

  if (imageInput.files.length) imageInput.dispatchEvent(new Event('change'))
}
