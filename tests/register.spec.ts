import { test, expect, type Page } from '@playwright/test';

const SUCCESS = 'Check your email to confirm your account';
const REGISTER_API = '**/api/v1/auth/register';

async function fillForm(page: Page, email: string, password: string, confirm: string) {
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByLabel('Confirm Password').fill(confirm);
    await page.getByRole('button', { name: 'Register' }).click();
}

test.beforeEach(async ({ page }) => {
    await page.goto('/register');
});

test('valid details call the API once and show the neutral message', async ({ page }) => {
    let calls = 0;
    await page.route(REGISTER_API, (route) => {
        calls++;
        return route.fulfill({ status: 202, json: {} });
    });

    await fillForm(page, 'user@example.com', 'password123', 'password123');

    await expect(page.getByText(SUCCESS)).toBeVisible();
    expect(calls).toBe(1);
});

test('invalid email shows an error and does not submit', async ({ page }) => {
    let calls = 0;
    await page.route(REGISTER_API, (route) => {
        calls++;
        return route.fulfill({ status: 202, json: {} });
    });

    await fillForm(page, 'not-an-email', 'password123', 'password123');

    await expect(page.getByText('Enter a valid email address')).toBeVisible();
    expect(calls).toBe(0);
});

test('password under 8 characters shows an error', async ({ page }) => {
    await fillForm(page, 'user@example.com', '1234567', '1234567');
    await expect(page.getByText('Password must be at least 8 characters')).toBeVisible();
});

test('mismatched passwords show an error', async ({ page }) => {
    await fillForm(page, 'user@example.com', 'password123', 'password124');
    await expect(page.getByText('Passwords do not match')).toBeVisible();
});

test('already-registered email shows the same message', async ({ page }) => {
    await page.route(REGISTER_API, (route) => route.fulfill({ status: 202, json: {} }));

    await fillForm(page, 'existing@example.com', 'password123', 'password123');

    await expect(page.getByText(SUCCESS)).toBeVisible();
});

test('429 shows a friendly error and can be retried', async ({ page }) => {
    let attempt = 0;
    await page.route(REGISTER_API, (route) =>
        route.fulfill({ status: ++attempt === 1 ? 429 : 202, json: {} }),
    );

    await fillForm(page, 'user@example.com', 'password123', 'password123');
    await expect(page.getByText('Too many attempts')).toBeVisible();

    await page.getByRole('button', { name: 'Register' }).click();
    await expect(page.getByText(SUCCESS)).toBeVisible();
});

test('500 shows a friendly error', async ({ page }) => {
    await page.route(REGISTER_API, (route) => route.fulfill({ status: 500, json: {} }));

    await fillForm(page, 'user@example.com', 'password123', 'password123');

    await expect(page.getByText('Something went wrong')).toBeVisible();
});