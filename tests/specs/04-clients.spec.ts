import { test, expect } from '@playwright/test'

const CLIENT_NAME = `TEST-${Date.now()}`

test.describe('Clients page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/clients')
    await page.waitForLoadState('networkidle')
  })

  test('loads client list', async ({ page }) => {
    await expect(page.getByText(/client|créances|encaissé/i).first()).toBeVisible()
  })

  test('can search clients', async ({ page }) => {
    const search = page.getByPlaceholder(/rechercher/i).first()
    await search.fill('zzz_no_match')
    await expect(page.getByText(/aucun|introuvable|0 client/i).first()).toBeVisible()
    await search.clear()
  })

  test('can create a new client', async ({ page }) => {
    await page.getByRole('button', { name: /nouveau client|ajouter/i }).click()
    await expect(page.getByText(/prénom|nom|téléphone/i).first()).toBeVisible()

    await page.getByPlaceholder(/prénom/i).fill(CLIENT_NAME)
    await page.getByPlaceholder(/nom/i).fill('TEST')
    await page.getByPlaceholder(/téléphone|tel/i).fill('+222 00 00 00 00')

    await page.getByRole('button', { name: /enregistrer|créer|sauvegarder/i }).click()

    await expect(page.getByText(CLIENT_NAME)).toBeVisible({ timeout: 10_000 })
  })

  test('can open client detail', async ({ page }) => {
    const firstClient = page.locator('[class*="cursor-pointer"]').first()
    if (await firstClient.count() === 0) test.skip(true, 'No clients')
    await firstClient.click()
    await expect(page.getByText(/transaction|paiement|crédit/i).first()).toBeVisible()
  })
})
