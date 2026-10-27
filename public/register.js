const form = document.getElementById('register-form');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const confirmInput = document.getElementById('confirm-password');
const submitButton = document.getElementById('submit-button');
const formError = document.getElementById('form-error');
const successMessage = document.getElementById('success-message');

function setError(input, message) {
    document.getElementById(`${input.id}-error`).textContent = message;
    if (message) {
        input.setAttribute('aria-invalid', 'true');
    } else {
        input.removeAttribute('aria-invalid');
    }
}

function validate(email, password, confirm) {
    let valid = true;

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        setError(emailInput, 'Enter a valid email address');
        valid = false;
    } else {
        setError(emailInput, '');
    }

    if (password.length < 8) {
        setError(passwordInput, 'Password must be at least 8 characters');
        valid = false;
    } else if (password.length > 1024) {
        setError(passwordInput, 'Password must be no more than 1024 characters');
        valid = false;
    } else {
        setError(passwordInput, '');
    }

    if (confirm !== password) {
        setError(confirmInput, 'Passwords do not match');
        valid = false;
    } else {
        setError(confirmInput, '');
    }

    return valid;
}

form.addEventListener('submit', async (event) => {
    event.preventDefault();
    formError.textContent = '';

    const email = emailInput.value.trim().toLowerCase();
    const password = passwordInput.value;
    const confirm = confirmInput.value;

    if (!validate(email, password, confirm)) return;

    submitButton.disabled = true;
    submitButton.textContent = 'Loading...';

    try {
        const apiBase = form.dataset.apiBaseUrl;
        const response = await fetch(`${apiBase}/api/v1/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        });

        if (response.ok) {
            form.hidden = true;
            successMessage.hidden = false;
            return;
        }

        if (response.status === 400) {
            formError.textContent = 'Please check your details and try again.';
        } else if (response.status === 429) {
            formError.textContent = 'Too many attempts. Please wait a moment and try again.';
        } else {
            formError.textContent = 'Something went wrong. Please try again.';
        }
    } catch {
        formError.textContent = 'Something went wrong. Please try again.';
    }

    submitButton.disabled = false;
    submitButton.textContent = 'Register';
});
