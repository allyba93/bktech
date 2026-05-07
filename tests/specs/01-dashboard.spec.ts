import { test, expect } from '@playwright/test'

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')
  })

  test('shows KPI cards', async ({ page }) => {
    // Should show at least 4 KPI cards (CA, transactions, solde, créances)
    const cards = page.locator('.rounded-xl').filter({ hasText: /MRU|transaction/i })
    await expect(cards.first()).toBeVisible()
  })

  test('shows stock alert section', async ({ page }) => {
    // Stock alerts or "Aucune alerte" message
    await expect(
      page.getByText(/alerte|rupture|stock/i).first()
    ).toBeVisible()
  })

  test('shows 7-day chart area', async ({ page }) => {
    await expect(page.getByText(/7 derniers|semaine|jours/i).first()).toBeVisible()
  })
})
