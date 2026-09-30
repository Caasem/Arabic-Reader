import { test, expect } from '@playwright/test';

/**
 * The redesign is on by default, its colours are user-pickable, and switching
 * it off in Settings restores the original design.
 */
test('look is on by default, takes a picked accent, and switches off cleanly', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('.navbar__settings', { timeout: 10000 });

  const dataLook = () => page.evaluate(() => document.documentElement.dataset.look ?? null);
  const accent = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim());

  await expect.poll(dataLook).toBe('ink');
  await expect.poll(accent).toBe('#9c7a4f');

  await page.click('.navbar__settings');
  await page.waitForSelector('.settings-panel', { timeout: 5000 });

  // Choosing another preset changes the accent.
  await page.locator('.look-palette', { hasText: 'Jewel tones' }).click();
  await expect.poll(accent).toBe('#1f3f8f');

  // Picking a single colour overrides just that role.
  await page.locator('input.look-color__input[aria-label="Accent"]').fill('#aa3311');
  await expect.poll(accent).toBe('#aa3311');

  // Reset returns to the preset.
  await page.locator('.look-settings__reset-all').click();
  await expect.poll(accent).toBe('#1f3f8f');

  // Off: the attribute and injected variables are gone.
  await page.locator('label', { hasText: 'New look' }).locator('input').uncheck();
  await expect.poll(dataLook).toBe(null);
  await expect(page.locator('#look-tokens')).toHaveCount(0);
  await expect.poll(accent).toBe('#9c7a4f');

  // The choice survives a reload.
  await page.reload({ waitUntil: 'networkidle' });
  await expect.poll(dataLook).toBe(null);
});

test('narrow screens get a floating tab bar, and the original bar returns when the look is off', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.waitForSelector('.navbar', { timeout: 10000 });
  const radius = () => page.$eval('.navbar', (el) => getComputedStyle(el).borderTopLeftRadius);

  await expect.poll(radius).toBe('30px');

  await page.click('.navbar__settings');
  await page.locator('label', { hasText: 'New look' }).locator('input').uncheck();
  await page.click('.settings-panel__close');
  await expect.poll(radius).toBe('0px');
});
