export {};

const logoutButton = document.getElementById('logout-button') as HTMLButtonElement;
const apiBase = document.body.dataset.apiBaseUrl ?? '';

logoutButton.addEventListener('click', async () => {
    try {
        await fetch(`${apiBase}/api/v1/auth/admin/logout`, {
            method: 'POST',
            credentials: 'include',
        });
    } finally {
        window.location.href = '/admin/login';
    }
});
