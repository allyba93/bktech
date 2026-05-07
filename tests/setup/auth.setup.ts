import { test as setup, expect } from '@playwright/test'
import path from 'path'
import fs from 'fs'

const AUTH_FILE = 'tests/.auth/state.json'

// Credentials — set TEST_EMAIL / TEST_PASSWORD env vars before running,
// or create a .env.test file with them.
const EMAIL    = process.env.TEST_EMAIL    ?? ''
const PASSWORD = process.env.TEST_PASSWORD ?? ''

setup('authenticate', async ({ page }) => {
  if (!EMAIL || !PASSWORD) {
    throw new Error(
      'Missing TEST_EMAIL / TEST_PASSWORD.\n' +
      'Run: TEST_EMAIL=you@x.com TEST_PASSWORD=secret npx playwright test\n' +
      'Or add them to a .env.test file.'
    )
  }

  await page.goto('/login')
  await expect(page.getByPlaceholder('votre@email.com')).toBeVisible()

  await page.getByPlaceholder('votre@email.com').fill(EMAIL)
  await page.getByPlaceholder(/mot de passe/i).fill(PASSWORD)
  await page.getByRole('button', { name: /connexion/i }).click()

  // Wait until redirected to dashboard
  await page.waitForURL('**/dashboard', { timeout: 15_000 })
  await expect(page).toHaveURL(/dashboard/)

  // Save session so other tests skip login
  fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true })
  await page.context().storageState({ path: AUTH_FILE })
})
