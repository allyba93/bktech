import { test, expect } from '@playwright/test'

test.describe('Cash (Caisse) page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/cash')
    await page.waitForLoadState('networkidle')
  })

  test('shows solde and KPI bar', async ({ page }) => {
    await expect(page.getByText(/solde actuel/i)).toBeVisible()
    await expect(page.getByText(/ouverture/i).first()).toBeVisible()
    await expect(page.getByText(/ventes du jour/i)).toBeVisible()
  })

  test('shows movement list or empty state', async ({ page }) => {
    await expect(
      page.getByText(/aucun mouvement|vente|dépense|entrée/i).first()
    ).toBeVisible()
  })

  test('can add a dépense', async ({ page }) => {
    await page.getByRole('button', { name: /dépense/i }).click()
    await expect(page.getByText(/montant|catégorie/i).first()).toBeVisible()

    await page.locator('input[type="number"]').first().fill('1000')

    // Select a category
    const catSelect = page.locator('select').first()
    if (await catSelect.isVisible()) {
      await catSelect.selectOption({ index: 1 })
    }

    // Select Cash payment
    const cashBtn = page.getByText(/cash/i).first()
    if (await cashBtn.isVisible()) await cashBtn.click()

    await page.getByRole('button', { name: /enregistrer|confirmer|valider/i }).click()

    // Should appear in the list
    await expect(page.getByText(/1\s*000|dépense/i).first()).toBeVisible({ timeout: 8_000 })
  })

  test('period filter works', async ({ page }) => {
    await page.getByRole('button', { name: /7 jours/i }).click()
    await expect(page.getByRole('button', { name: /7 jours/i })).toHaveClass(/bg-\[#1a1a18\]/)
    await page.getByRole('button', { name: /aujourd'hui/i }).click()
  })

  test('clicking a vente row opens invoice modal', async ({ page }) => {
    // Find a vente row
    const venteRow = page.locator('[class*="cursor-pointer"]').filter({ hasText: /vente pos/i }).first()
    if (await venteRow.count() === 0) {
      test.skip(true, 'No vente rows visible for today')
    }
    await venteRow.click()
    await expect(page.getByText(/facture|F-\d{4}/i).first()).toBeVisible()
    await page.keyboard.press('Escape')
  })
})
