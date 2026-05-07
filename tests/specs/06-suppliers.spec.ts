import { test, expect } from '@playwright/test'

test.describe('Suppliers (Fournisseurs) page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/suppliers')
    await page.waitForLoadState('networkidle')
  })

  test('loads supplier list or empty state', async ({ page }) => {
    await expect(
      page.getByText(/fournisseur|nouveau|aucun/i).first()
    ).toBeVisible()
  })

  test('can open new supplier form', async ({ page }) => {
    await page.getByRole('button', { name: /nouveau fournisseur|ajouter/i }).click()
    await expect(page.getByText(/nom|pays|délai/i).first()).toBeVisible()
    await page.keyboard.press('Escape')
  })

  test('can select a supplier and see details', async ({ page }) => {
    const firstSupplier = page.locator('[class*="cursor-pointer"]').first()
    if (await firstSupplier.count() === 0) {
      test.skip(true, 'No suppliers in DB')
    }
    await firstSupplier.click()
    await expect(page.getByText(/commande|en cours|paiement/i).first()).toBeVisible()
  })
})
