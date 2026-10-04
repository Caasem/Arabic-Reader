import { test, expect } from '@playwright/test';
import { useOriginalReader } from './originalReader';

test.beforeEach(async ({ page }) => useOriginalReader(page));

/**
 * Press Alt+D in the reader (the key can come from inside the book's iframe or
 * the host page) to open the dictionary search; Alt+D again closes it.
 */
test('Alt+D opens and closes the dictionary search, in every style', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.waitForSelector('text=Try the sample book', { timeout: 10000 });
  await page.click('text=Try the sample book');
  await page.waitForSelector('.book-card', { timeout: 15000 });
  await page.click('.book-card');
  await page.waitForSelector('.reader__epub iframe', { timeout: 30000 });
  await page.waitForTimeout(2500);

  const frame = page.frames().find((f) => f !== page.mainFrame())!;
  const word = await frame.evaluate(() => (document.querySelector('p .ar-word') as HTMLElement).dataset.word!);
  const pressDInBook = () =>
    frame.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', code: 'KeyD', altKey: true, bubbles: true })));

  // Floating is the default; Alt+D from inside the book opens it.
  await pressDInBook();
  await expect(page.locator('.dsearch--floating')).toBeVisible();
  await page.keyboard.type(word);
  await expect(page.locator('.dsearch__entry').first()).toBeVisible({ timeout: 8000 });

  // Alt+D also closes it while typing in the box, and a plain "d" is not a shortcut.
  await page.keyboard.press('Alt+d');
  await expect(page.locator('.dsearch')).toHaveCount(0);

  // Escape closes it too.
  await pressDInBook();
  await expect(page.locator('.dsearch--floating')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.dsearch')).toHaveCount(0);

  // Each style is a settings choice, and the reader stays mounted meanwhile.
  for (const [label, cls] of [
    ['Command palette', '.dsearch--palette'],
    ['Side drawer', '.dsearch--drawer'],
    ['Bottom sheet', '.dsearch--sheet'],
  ] as const) {
    await page.click('.navbar__settings');
    await page.locator('.settings-row', { hasText: 'Search style' }).locator('select').selectOption({ label });
    await page.click('.settings-panel__close');
    await page.keyboard.press('Alt+d');
    await expect(page.locator(cls)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.dsearch')).toHaveCount(0);
  }

  // Switched off, Alt+D does nothing.
  await page.click('.navbar__settings');
  await page.locator('label', { hasText: 'Enable the Alt+D shortcut' }).locator('input').uncheck();
  await page.click('.settings-panel__close');
  await page.keyboard.press('Alt+d');
  await expect(page.locator('.dsearch')).toHaveCount(0);
});
