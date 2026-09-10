import { test, expect } from '@playwright/test';

test('theme, font size, and dictionary-provider toggles persist and actually filter lookups', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('.navbar__settings', { timeout: 10000 });

  await page.click('.navbar__settings');
  await page.waitForSelector('.settings-panel', { timeout: 5000 });

  // The 'dark' theme id is branded "Night" in the UI.
  await page.locator('.segmented__item', { hasText: 'Night' }).click();
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');

  const fontSlider = page.locator('.settings-row', { hasText: 'Font size' }).locator('input[type=range]');
  await fontSlider.fill('140');
  await page.waitForTimeout(200);
  const fontLabel = await page.textContent('.settings-row:has-text("Font size") .settings-row__value');
  expect(fontLabel?.trim()).toBe('140%');

  // Enable both mock dictionaries, then disable just A, to exercise provider filtering end to end.
  const providerRows = await page.locator('.settings-row--dict .settings-toggle__label').allTextContents();
  expect(providerRows.some((p) => p.includes('Dictionary A'))).toBe(true);
  expect(providerRows.some((p) => p.includes('AraMorph'))).toBe(true);

  await page.locator('.settings-row--dict', { hasText: 'Dictionary A' }).locator('input[type=checkbox]').check();
  await page.locator('.settings-row--dict', { hasText: 'Dictionary B' }).locator('input[type=checkbox]').check();
  await page.locator('.settings-row--dict', { hasText: 'Dictionary A' }).locator('input[type=checkbox]').uncheck();
  await page.waitForTimeout(300); // preference writes are fire-and-forget

  await page.reload({ waitUntil: 'networkidle' });
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');

  await page.click('.navbar__settings');
  await page.waitForSelector('.settings-panel', { timeout: 5000 });
  const fontLabelAfterReload = await page.textContent('.settings-row:has-text("Font size") .settings-row__value');
  expect(fontLabelAfterReload?.trim()).toBe('140%');
  await expect(page.locator('.settings-row--dict', { hasText: 'Dictionary A' }).locator('input[type=checkbox]')).not.toBeChecked();

  // Confirm the disabled provider is actually excluded from lookups (A
  // absent, B still present) rather than the toggle only being cosmetic.
  await page.click('.settings-panel__close');
  await page.locator('.navbar__item', { hasText: 'Library' }).click();
  await page.waitForSelector('text=Try the sample book', { timeout: 10000 });
  await page.click('text=Try the sample book');
  await page.waitForSelector('.book-card', { timeout: 15000 });
  await page.click('.book-card');
  await page.waitForSelector('.reader__epub iframe', { timeout: 15000 });
  await page.waitForTimeout(1800);

  const frame = page.frames().find((f) => f !== page.mainFrame())!;
  await frame.evaluate(() => {
    document.querySelector('p .ar-word')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
  await page.waitForSelector('.dict-popup', { timeout: 8000 });
  await page.waitForTimeout(600);
  const popupText = (await page.textContent('.dict-popup'))!;
  expect(popupText).not.toContain('Dictionary A');
  expect(popupText).toContain('Dictionary B');
});
