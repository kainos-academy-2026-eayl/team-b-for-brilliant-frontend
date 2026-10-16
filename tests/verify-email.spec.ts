import { test, expect } from '@playwright/test';

const VERIFY_API = '**/api/v1/auth/verify-email';

test('valid link shows success and a login link', async ({ page }) => {
    await page.route(VERIFY_API, (route) => route.fulfill({ status: 200, json: {} }));

    await page.goto('/verify-email?token=valid-token');

    await expect(page.getByText('Your email has been confirmed.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Go to login' })).toBeVisible();
});

test('invalid link shows an error and a resend option', async ({ page }) => {
    await page.route(VERIFY_API, (route) => route.fulfill({ status: 400, json: {} }));

    await page.goto('/verify-email?token=bad-token');

    await expect(page.getByText('This link is invalid or has expired.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Send me a new email' })).toBeVisible();
});