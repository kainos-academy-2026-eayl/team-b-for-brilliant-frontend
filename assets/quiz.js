for (const form of document.querySelectorAll('[data-quiz]')) {
  const feedback = form.querySelector('[data-feedback]')

  form.addEventListener('submit', (event) => {
    event.preventDefault()
    const selected = form.querySelector('input[type="radio"]:checked')
    if (!selected) {
      feedback.textContent = 'Choose an answer first.'
      return
    }
    const correct = selected.value === form.dataset.answer
    feedback.dataset.state = correct ? 'correct' : 'incorrect'
    feedback.textContent = correct
      ? form.dataset.correctFeedback
      : form.dataset.incorrectFeedback
  })

  form.addEventListener('reset', () => {
    feedback.textContent = ''
    delete feedback.dataset.state
  })
}
