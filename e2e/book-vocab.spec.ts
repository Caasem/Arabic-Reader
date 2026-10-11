import { test, expect } from '@playwright/test';

/**
 * Press Alt+V in the reader to list the words saved from this book; Alt+V again closes it.
 */
test('Alt+V lists the words saved from this book', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.waitForSelector('text=Try the sample book', { timeout: 10000 });
  await page.click('text=Try the sample book');
  await page.waitForSelector('.book-card', { timeout: 15000 });
  await page.click('.book-card');
  await page.waitForSelector('.qr-chapter .ar-word', { timeout: 30000 });

  const pressVInBook = () => page.keyboard.press('Alt+v');

  // Nothing saved yet.
  await pressVInBook();
  await expect(page.locator('.bvocab')).toBeVisible();
  await expect(page.locator('.bvocab__hint')).toContainText('No words saved');
  await page.keyboard.press('Alt+v');
  await expect(page.locator('.bvocab')).toHaveCount(0);

  // Save a word (tap it, then the quick-add shortcut), and it shows up.
  await page.click('.navbar__settings');
  await page.locator('.settings-toggle', { hasText: 'Quick-add shortcut' }).locator('input').check();
  await page.click('.settings-panel__close');
  await page.locator('.qr-chapter p .ar-word').first().click();
  await page.waitForSelector('.dict-popup', { timeout: 8000 });
  await page.waitForTimeout(600);
  await page.keyboard.press('Control+Shift+A');
  await expect(page.locator('.reader__quick-add-toast')).toContainText('added to vocabulary');
  await page.click('.dict-popup__close');

  await pressVInBook();
  await expect(page.locator('.bvocab__row')).toHaveCount(1);
  await expect(page.locator('.bvocab__summary')).toContainText('1 word saved');
  await page.locator('.bvocab__row-main').click();
  await expect(page.locator('.bvocab__btn--primary')).toBeVisible();
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await expect(page.locator('.bvocab__row')).toHaveCount(1);
  await page.getByRole('button', { name: 'Known', exact: true }).click();
  await expect(page.locator('.bvocab__row')).toHaveCount(0);

  // Escape closes it.
  await page.keyboard.press('Escape');
  await expect(page.locator('.bvocab')).toHaveCount(0);

  // Switched off, Alt+V does nothing.
  await page.click('.navbar__settings');
  await page.locator('label', { hasText: 'Enable the Alt+V shortcut' }).locator('input').uncheck();
  await page.click('.settings-panel__close');
  await page.keyboard.press('Alt+v');
  await expect(page.locator('.bvocab')).toHaveCount(0);
});
