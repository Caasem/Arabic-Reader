import { test, expect } from '@playwright/test';

test('hover-preview toggle: off by default, shows a condensed pill when enabled, persists across reload', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('.navbar__settings', { timeout: 10000 });

  await page.click('.navbar__settings');
  await page.waitForSelector('.settings-panel', { timeout: 5000 });
  const hoverRow = page.locator('.settings-row', { hasText: 'Show translation on hover' });
  await expect(hoverRow.locator('input[type=checkbox]')).not.toBeChecked();

  await page.click('.settings-panel__close');
  await page.locator('.navbar__item', { hasText: 'Library' }).click();
  await page.waitForSelector('text=Try the sample book', { timeout: 10000 });
  await page.click('text=Try the sample book');
  await page.waitForSelector('.book-card', { timeout: 15000 });
  await page.click('.book-card');
  await page.waitForSelector('.reader__epub iframe', { timeout: 15000 });
  await page.waitForTimeout(1800);

  const frame = () => page.frames().find((f) => f !== page.mainFrame())!;

  // Off by default: hovering must not show a preview.
  await frame().evaluate(() => {
    document.querySelector('p .ar-word')!.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true }));
  });
  await page.waitForTimeout(600);
  await expect(page.locator('.hover-preview')).toHaveCount(0);

  // Enable it.
  await page.click('.navbar__settings');
  await page.waitForSelector('.settings-panel', { timeout: 5000 });
  await hoverRow.locator('input[type=checkbox]').check();
  await page.click('.settings-panel__close');
  await page.locator('.navbar__label', { hasText: /^Read$/ }).click();
  await page.waitForSelector('.reader__epub iframe', { timeout: 10000 });
  await page.waitForTimeout(1200);

  await frame().evaluate(() => {
    document.querySelector('p .ar-word')!.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true, relatedTarget: document.body }));
  });
  await page.waitForSelector('.hover-preview', { timeout: 3000 });
  const previewText = await page.textContent('.hover-preview__text');
  expect(previewText?.trim()).toBeTruthy();

  // Mouseout dismisses it.
  await frame().evaluate(() => {
    document.querySelector('p .ar-word')!.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, cancelable: true, relatedTarget: document.body }));
  });
  await page.waitForTimeout(300);
  await expect(page.locator('.hover-preview')).toHaveCount(0);

  // A click still opens the full popup, unaffected by hover wiring.
  await frame().evaluate(() => {
    document.querySelector('p .ar-word')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
  await page.waitForSelector('.dict-popup', { timeout: 8000 });
  await page.click('.dict-popup__close');
  await page.waitForTimeout(200);

  // Persists across reload.
  await page.reload({ waitUntil: 'networkidle' });
  await page.click('.navbar__settings');
  await page.waitForSelector('.settings-panel', { timeout: 5000 });
  await expect(page.locator('.settings-row', { hasText: 'Show translation on hover' }).locator('input[type=checkbox]')).toBeChecked();
});
