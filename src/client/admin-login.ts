export { };

const form = document.getElementById('login-form') as HTMLFormElement;
const emailInput = document.getElementById('email') as HTMLInputElement;
const passwordInput = document.getElementById('password') as HTMLInputElement;
const submitButton = document.getElementById('submit-button') as HTMLButtonElement;
const formError = document.getElementById('form-error') as HTMLDivElement;
const COMPANY_DOMAIN = '@b-brilliant.com';

type LoginErrorBody = { field?: 'email' | 'password'; };

function setError(input: HTMLInputElement, message: string): void {
    const errorElement = document.getElementById(`${input.id}-error`);
    if (errorElement) errorElement.textContent = message;

    if (message) {
        input.setAttribute('aria-invalid', 'true');
    } else {
        input.removeAttribute('aria-invalid');
    }
}

function getSafeNextUrl(): string {
    const next = new URLSearchParams(window.location.search).get('next');
    if (next && next.startsWith('/') && !next.startsWith('//')) {
        try {
            const target = new URL(next, window.location.origin);
            if (target.origin === window.location.origin) return target.href;
        } catch {
            return '/admin/account';
        }
    }
    return '/admin/account';
}

form.addEventListener('submit', async (event) => {
    event.preventDefault();
    formError.textContent = '';
    setError(emailInput, '');
    setError(passwordInput, '');

    const email = emailInput.value.trim().toLowerCase();
    const password = passwordInput.value;
    let valid = true;

    if (!email) {
        setError(emailInput, 'Enter your email.');
        valid = false;
    } else if (!email.endsWith(COMPANY_DOMAIN)) {
        setError(emailInput, 'Use your company email address.');
        valid = false;
    }

    if (!password) {
        setError(passwordInput, 'Enter your password.');
        valid = false;
    }

    if (!valid) return;

    submitButton.disabled = true;
    submitButton.textContent = 'Signing in...';

    try {
        const apiBase = form.dataset.apiBaseUrl ?? '';
        const response = await fetch(`${apiBase}/api/v1/auth/admin/login`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        });

        if (response.ok) {
            window.location.href = getSafeNextUrl();
            return;
        }

        if (response.status === 429) {
            formError.textContent = 'Too many attempts. Please try again later.';
        } else if (response.status === 401) {
            const body: LoginErrorBody = await response.json().catch(() => ({}));
            if (body.field === 'email') {
                setError(emailInput, 'No staff account found with that email.');
            } else if (body.field === 'password') {
                setError(passwordInput, 'Incorrect password.');
            } else {
                formError.textContent = 'Invalid email or password.';
            }
        } else {
            formError.textContent = 'Something went wrong. Please try again.';
        }
    } catch {
        formError.textContent = 'Something went wrong. Please try again.';
    }

    submitButton.disabled = false;
    submitButton.textContent = 'Sign in';
});
