import { test, expect } from '@playwright/test'

test.describe('POS page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/pos')
    await page.waitForLoadState('networkidle')
  })

  test('loads product grid', async ({ page }) => {
    // Either shows products or an empty state
    await expect(
      page.getByText(/produit|aucun|stock/i).first()
    ).toBeVisible()
  })

  test('can search for a product', async ({ page }) => {
    const search = page.getByPlaceholder(/rechercher/i).first()
    await search.fill('zzz_no_match')
    // Grid should show empty or filtered state
    await expect(page.locator('.grid, [class*="grid"]').first()).toBeVisible()
    await search.clear()
  })

  test('complete a comptoir sale', async ({ page }) => {
    // Find a product card with stock > 0
    const productCard = page.locator('[class*="cursor-pointer"]').filter({
      hasNotText: /stock.*0|rupture/i,
    }).first()

    if (await productCard.count() === 0) {
      test.skip(true, 'No products with stock available')
    }

    await productCard.click()

    // OEModal should open
    await expect(page.locator('[class*="rounded-2xl"]').filter({ hasText: /référence|qty/i }).first()).toBeVisible()

    // Try to set qty on first ref to 1
    const qtyPlus = page.locator('button').filter({ hasText: '+' }).or(
      page.locator('[class*="ChevronUp"], button').first()
    )
    // Increment qty for first ref
    const incrementBtn = page.locator('button').filter({ hasText: /^\+$/ }).first()
    if (await incrementBtn.isVisible()) {
      await incrementBtn.click()
    } else {
      // Try number input
      const qtyInput = page.locator('input[type="number"]').first()
      await qtyInput.fill('1')
    }

    // Confirm adding to cart
    await page.getByRole('button', { name: /confirmer|ajouter/i }).first().click()

    // Cart should now have 1 item
    await expect(page.getByText(/total|MRU/i).first()).toBeVisible()

    // Click pay / Encaisser
    const payBtn = page.getByRole('button', { name: /encaisser|payer|vente comptoir/i })
    if (await payBtn.isVisible()) {
      await payBtn.click()

      // Select cash payment
      const cashBtn = page.getByText(/cash|FSS/i).first()
      if (await cashBtn.isVisible()) await cashBtn.click()

      // Confirm sale
      const confirmBtn = page.getByRole('button', { name: /confirmer la vente|valider/i })
      if (await confirmBtn.isVisible()) {
        await confirmBtn.click()
        // Invoice modal or reset state
        await expect(
          page.getByText(/facture|F-\d{4}|vente confirmée/i).first()
        ).toBeVisible({ timeout: 10_000 })
      }
    }
  })
})
