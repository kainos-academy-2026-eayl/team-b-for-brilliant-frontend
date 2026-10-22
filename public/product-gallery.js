const mainImage = document.getElementById('product-main-image')
const thumbnails = document.querySelectorAll('.product-detail__thumbnail')

for (const thumbnail of thumbnails) {
  thumbnail.addEventListener('click', () => {
    mainImage.src = thumbnail.dataset.imageSrc
    mainImage.alt = thumbnail.dataset.imageAlt

    for (const button of thumbnails) {
      button.setAttribute('aria-pressed', String(button === thumbnail))
    }
  })
}
