import { test, expect } from '@playwright/test'

const PRODUCT_NAME = `TEST-STOCK-${Date.now()}`

test.describe('Stock page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/stock')
    await page.waitForLoadState('networkidle')
  })

  test('loads stock table', async ({ page }) => {
    await expect(page.getByText(/disponible/i).first()).toBeVisible()
  })

  test('can open Catégories manager', async ({ page }) => {
    await page.getByRole('button', { name: /catégories/i }).click()
    await expect(page.getByText(/gérer les catégories/i)).toBeVisible()
    await page.keyboard.press('Escape')
  })

  test('can search products', async ({ page }) => {
    const search = page.getByPlaceholder(/rechercher un produit/i)
    await search.fill('zzz_no_match_xyz')
    await expect(page.getByText(/aucun produit|no product/i)).toBeVisible()
    await search.clear()
  })

  test('create a new product (requires a category to exist)', async ({ page }) => {
    // Open categories manager and check at least one category exists
    await page.getByRole('button', { name: /catégories/i }).click()
    const catCount = await page.locator('.border-b.border-black\\/\\[0\\.06\\]').count()
    await page.keyboard.press('Escape')

    if (catCount === 0) {
      test.skip(true, 'No categories in DB — create one first')
    }

    // Open new product modal
    await page.getByRole('button', { name: /nouveau produit/i }).click()
    await expect(page.getByText(/nom du produit/i)).toBeVisible()

    // Fill product name
    await page.getByPlaceholder(/ex: coques/i).fill(PRODUCT_NAME)

    // Pick first available category
    const catSelect = page.locator('select').first()
    const options = await catSelect.locator('option').all()
    const validOption = options.find(async o => {
      const val = await o.getAttribute('value')
      return val && val !== '' && val !== '__new__'
    })
    if (!validOption) {
      test.skip(true, 'No valid category option available')
      return
    }
    const catValue = await validOption.getAttribute('value')
    await catSelect.selectOption(catValue!)

    // Add a reference
    await page.getByRole('button', { name: /ajouter/i }).click()
    await page.locator('input[placeholder^="Référence"]').last().fill('REF-TEST')

    // Fill initial qty
    const qtyInput = page.locator('input[placeholder="Qté*"]').last()
    await qtyInput.fill('10')

    // Fill price (Prix*)
    const priceInput = page.locator('input[placeholder="Prix*"]').last()
    if (await priceInput.isVisible()) {
      await priceInput.fill('500')
    }

    // Save
    await page.getByRole('button', { name: /créer/i }).click()

    // Verify product appears in table
    await expect(page.getByText(PRODUCT_NAME)).toBeVisible({ timeout: 10_000 })
  })

  test('can open product detail modal', async ({ page }) => {
    const firstRow = page.locator('tbody tr').first()
    if (await firstRow.count() === 0) {
      test.skip(true, 'No products in DB')
    }
    await firstRow.click()
    await expect(page.getByText(/référence|ajuster/i).first()).toBeVisible()
    await page.keyboard.press('Escape')
  })
})
