const page = document.getElementById('verify-page');
const apiBase = page.dataset.apiBaseUrl;
const loading = document.getElementById('verify-loading');
const success = document.getElementById('verify-success');
const errorBox = document.getElementById('verify-error');
const resendForm = document.getElementById('resend-form');
const resendEmail = document.getElementById('resend-email');
const resendMessage = document.getElementById('resend-message');

function showError() {
    loading.hidden = true;
    errorBox.hidden = false;
}

async function verify() {
    const token = new URLSearchParams(window.location.search).get('token');
    if (!token) {
        showError();
        return;
    }

    try {
        const response = await fetch(`${apiBase}/api/v1/auth/verify-email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token }),
        });

        if (response.ok) {
            loading.hidden = true;
            success.hidden = false;
        } else {
            showError();
        }
    } catch {
        showError();
    }
}

resendForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    resendMessage.textContent = '';

    try {
        const response = await fetch(`${apiBase}/api/v1/auth/resend-verification`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: resendEmail.value.trim() }),
        });

        resendMessage.textContent = response.ok
            ? 'Check your email for a new link.'
            : 'Something went wrong. Please try again.';
    } catch {
        resendMessage.textContent = 'Something went wrong. Please try again.';
    }
});

verify();