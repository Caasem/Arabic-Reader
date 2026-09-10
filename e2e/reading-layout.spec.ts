import { test, expect } from '@playwright/test';

test('nav labels, Paged/Scrolling layout toggle actually scrolls, and persists', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('.navbar__settings', { timeout: 15000 });

  await page.locator('.navbar__item', { hasText: 'Library' }).click();
  await page.waitForSelector('text=Try the sample book', { timeout: 10000 });
  await page.click('text=Try the sample book');
  await page.waitForSelector('.book-card', { timeout: 15000 });
  await page.click('.book-card');
  await page.waitForSelector('.reader__epub iframe', { timeout: 15000 });
  await page.waitForTimeout(1800);

  const prevLabel = await page.textContent('.reader__nav-btn[aria-label="Previous page"] .reader__nav-btn-label');
  const nextLabel = await page.textContent('.reader__nav-btn[aria-label="Next page"] .reader__nav-btn-label');
  expect(prevLabel).toBe('Previous');
  expect(nextLabel).toBe('Next');

  await page.click('.navbar__settings');
  await page.waitForSelector('.settings-panel', { timeout: 5000 });
  const layoutRow = page.locator('.settings-row', { hasText: 'Layout' });
  const beforeOptions = await layoutRow.locator('.segmented__item').allTextContents();
  expect(beforeOptions).toContain('Paged');
  expect(beforeOptions).toContain('Scrolling');
  await expect(layoutRow.locator('.segmented__item', { hasText: 'Paged' })).toHaveClass(/segmented__item--active/);

  await layoutRow.locator('.segmented__item', { hasText: 'Scrolling' }).click();
  await page.waitForTimeout(400);
  await expect(layoutRow.locator('.segmented__item', { hasText: 'Scrolling' })).toHaveClass(/segmented__item--active/);
  await page.click('.settings-panel__close');
  await page.waitForTimeout(300);

  const scrollInfo = await page.evaluate(() => {
    const container = document.querySelector('.reader__epub');
    const stage = container?.firstElementChild;
    if (!stage) return null;
    const style = getComputedStyle(stage);
    return { overflowY: style.overflowY };
  });
  expect(scrollInfo && ['auto', 'scroll'].includes(scrollInfo.overflowY), `expected overflow-y auto/scroll in scrolled mode, got ${JSON.stringify(scrollInfo)}`).toBe(true);

  // Persists across reload.
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.navbar__settings', { timeout: 15000 });
  await page.click('.navbar__settings');
  await page.waitForSelector('.settings-panel', { timeout: 5000 });
  await expect(
    page.locator('.settings-row', { hasText: 'Layout' }).locator('.segmented__item', { hasText: 'Scrolling' })
  ).toHaveClass(/segmented__item--active/);

  // Reset to Paged so other tests (and a human running this locally) start
  // from the default layout.
  await page.locator('.settings-row', { hasText: 'Layout' }).locator('.segmented__item', { hasText: 'Paged' }).click();
  await page.click('.settings-panel__close');
});
