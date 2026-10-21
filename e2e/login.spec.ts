import { expect, type Page, test } from '@playwright/test'

async function signIn(page: Page, email: string, password: string) {
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
}

test('valid login lands on the account page and can log out', async ({
  page,
}) => {
  await page.goto('/login')
  await signIn(page, 'jane@example.com', 'correct')
  await expect(page).toHaveURL(/\/account$/)

  await page.getByRole('button', { name: 'Log out' }).click()
  await page.goto('/account')
  await expect(page).toHaveURL(/\/login/)
})

test('invalid credentials show a generic error', async ({ page }) => {
  await page.goto('/login')
  await signIn(page, 'jane@example.com', 'wrong')
  await expect(page.getByRole('alert')).toContainText(
    'Email or password is incorrect',
  )
  await expect(page).toHaveURL(/\/login/)
})

test('redirects back to the original page after login', async ({ page }) => {
  await page.goto('/account')
  await expect(page).toHaveURL(/\/login\?returnTo=%2Faccount/)
  await signIn(page, 'jane@example.com', 'correct')
  await expect(page).toHaveURL(/\/account$/)
})

test('blocks sign-in after 5 failed attempts', async ({ page }) => {
  await page.goto('/login')
  for (let i = 0; i < 5; i++) {
    await signIn(page, 'locked@example.com', 'wrong')
  }
  await signIn(page, 'locked@example.com', 'wrong')
  await expect(page.getByRole('alert')).toContainText(
    'Too many failed attempts',
  )
})
