import { test, expect } from '@playwright/test';

test('theme, font size, and dictionary-provider toggles persist and actually filter lookups', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('.navbar__settings', { timeout: 10000 });

  await page.click('.navbar__settings');
  await page.waitForSelector('.settings-panel', { timeout: 5000 });

  // The 'dark' theme id is branded "Night" in the UI.
  await page.locator('.segmented__item', { hasText: 'Night' }).click();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');

  const fontSlider = page.locator('.settings-row', { hasText: 'Font size' }).locator('input[type=range]');
  await fontSlider.fill('140');
  await expect(page.locator('.settings-row:has-text("Font size") .settings-row__value')).toHaveText('140%');

  // Provider filtering: switch Al-Wasīṭ on and AraMorph off.
  const aramorphToggle = page.locator('.settings-row--dict', { hasText: 'AraMorph' }).locator('input[type=checkbox]');
  const alWasitToggle = page.locator('.settings-row--dict', { hasText: 'Wasīṭ' }).locator('input[type=checkbox]');
  await expect(aramorphToggle).toBeChecked();
  await expect(alWasitToggle).not.toBeChecked();
  // The demo dictionaries only exist in development builds.
  await expect(page.locator('.settings-row--dict', { hasText: 'Dictionary A' })).toHaveCount(0);

  await alWasitToggle.check();
  await aramorphToggle.uncheck();
  await page.waitForTimeout(300); // let the preference change land

  await page.reload({ waitUntil: 'networkidle' });
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');

  await page.click('.navbar__settings');
  await page.waitForSelector('.settings-panel', { timeout: 5000 });
  await expect(page.locator('.settings-row:has-text("Font size") .settings-row__value')).toHaveText('140%');
  await expect(aramorphToggle).not.toBeChecked();
  await expect(alWasitToggle).toBeChecked();

  // The disabled provider is actually excluded from lookups, not just hidden.
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
    const span = document.createElement('span');
    span.className = 'ar-word';
    span.dataset.word = 'كتاب';
    span.textContent = 'كتاب';
    document.querySelector('p')!.appendChild(span);
    span.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
  await expect(page.locator('.dict-popup__group-header', { hasText: 'Wasīṭ' })).toBeVisible({ timeout: 20000 });
  await expect(page.locator('.dict-popup__group-header', { hasText: 'AraMorph' })).toHaveCount(0);
});
