import { test, expect } from '@playwright/test';

/** Settings -> Dictionaries: a row's grip moves it with the arrow keys (or by dragging), and the order is remembered. */
test('dictionaries can be reordered in settings', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.waitForSelector('.navbar__settings', { timeout: 10000 });
  await page.click('.navbar__settings');
  await page.waitForSelector('.settings-panel');

  const names = () => page.locator('.settings-row--dict .settings-toggle__label').allTextContents();
  const before = await names();
  expect(before.length).toBeGreaterThan(1);

  // The first row cannot go up; moving the first down swaps it with the second.
  const grip = page.locator('.settings-row--dict').first().getByRole('button', { name: /^Move .* \(position 1 of \d+\)$/ });
  await grip.focus();
  await page.keyboard.press('ArrowUp');
  expect(await names()).toEqual(before);
  await page.keyboard.press('ArrowDown');
  await expect.poll(names).not.toEqual(before);
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
