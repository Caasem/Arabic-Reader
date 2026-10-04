import { test, expect } from '@playwright/test';

/** Settings -> Dictionaries: the arrows reorder the dictionaries, and the choice is remembered. */
test('dictionaries can be reordered in settings', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.waitForSelector('.navbar__settings', { timeout: 10000 });
  await page.click('.navbar__settings');
  await page.waitForSelector('.settings-panel');

  const names = () => page.locator('.settings-row--dict .settings-toggle__label').allTextContents();
  const before = await names();
  expect(before.length).toBeGreaterThan(1);

  // The first row cannot go up; moving the first down swaps it with the second.
  await expect(page.locator('.settings-row--dict').first().getByRole('button', { name: /up$/ })).toBeDisabled();
  await page.locator('.settings-row--dict').first().getByRole('button', { name: /down$/ }).click();
  const after = await names();
  expect(after[0]).toBe(before[1]);
  expect(after[1]).toBe(before[0]);

  // Remembered after a reload.
  await page.waitForTimeout(600);
  await page.reload({ waitUntil: 'networkidle' });
  await page.click('.navbar__settings');
  await page.waitForSelector('.settings-panel');
  expect(await names()).toEqual(after);
});
