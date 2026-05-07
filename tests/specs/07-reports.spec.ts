import { test, expect } from '@playwright/test'

test.describe('Reports page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/reports')
    await page.waitForLoadState('networkidle')
  })

  test('shows period selector', async ({ page }) => {
    await expect(page.getByText(/aujourd'hui|semaine|mois/i).first()).toBeVisible()
  })

  test('shows revenue KPI', async ({ page }) => {
    await expect(page.getByText(/chiffre d'affaires|CA|revenus/i).first()).toBeVisible()
  })

  test('period buttons switch active state', async ({ page }) => {
    const weekBtn = page.getByRole('button', { name: /7 jours|semaine/i }).first()
    await weekBtn.click()
    await expect(weekBtn).toHaveClass(/bg-\[#1a1a18\]|active/)
  })

  test('shows expense breakdown or empty state', async ({ page }) => {
    await expect(
      page.getByText(/dépense|charge|sortie|aucune/i).first()
    ).toBeVisible()
  })
})
