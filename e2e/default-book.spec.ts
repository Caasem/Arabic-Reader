import { test, expect } from '@playwright/test';

// A fresh browser (no "already added" flag) gets the bundled default book once.
test.use({ storageState: { cookies: [], origins: [] } });

test('the bundled default book is added once and stays removed after you delete it', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  const card = page.locator('.book-card', { hasText: 'الأخبار الطوال' });
  await expect(card).toHaveCount(1, { timeout: 20000 });

  // Reloading does not add a second copy.
  await page.reload({ waitUntil: 'networkidle' });
  await expect(card).toHaveCount(1, { timeout: 20000 });

  // Removing it does not bring it back.
  await card.hover();
  await card.locator('.book-card__remove, [aria-label^="Remove"]').first().click();
  await page.getByRole('button', { name: /remove/i }).last().click();
  await expect(card).toHaveCount(0);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await expect(card).toHaveCount(0);
});
