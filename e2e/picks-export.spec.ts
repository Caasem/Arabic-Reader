import { test, expect } from '@playwright/test';
import { useOriginalReader } from './originalReader';

test.beforeEach(async ({ page }) => useOriginalReader(page));

/**
 * Alt+P opens a panel with the entries saved from this book and a button that writes them to a file.
 * Empty before anything is saved; after saving an entry with its round +, the file holds that entry.
 */
test('Alt+P lists the saved entries and saves them to a file', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.waitForSelector('text=Try the sample book', { timeout: 10000 });
  await page.click('text=Try the sample book');
  await page.waitForSelector('.book-card', { timeout: 15000 });
  await page.click('.book-card');
  await page.waitForSelector('.reader__epub iframe', { timeout: 30000 });
  await page.waitForTimeout(2500);

  // Nothing saved yet.
  await page.keyboard.press('Alt+KeyP');
  const panel = page.locator('.pexport');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('Nothing yet');
  await expect(panel.getByRole('button', { name: 'Save file' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);

  // Save one entry with its round +, in a word whose popup has more than one entry.
  const frame = page.frames().find((f) => f !== page.mainFrame())!;
  const count = await frame.evaluate(() => document.querySelectorAll('p .ar-word').length);
  let saved = false;
  for (let i = 0; i < Math.min(count, 40) && !saved; i++) {
    await frame.evaluate((n) => document.querySelectorAll('p .ar-word')[n].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })), i);
    await page.waitForSelector('.dict-popup', { timeout: 8000 });
    await page.waitForTimeout(700);
    if ((await page.locator('.dict-popup__entry-save').count()) > 1) {
      await page.locator('.dict-popup__entry-save').first().click();
      await page.waitForTimeout(500);
      saved = true;
    }
    await page.click('.dict-popup__close');
  }
  expect(saved, 'a word with several entries turns up').toBe(true);

  // The panel now shows it and the file holds it.
  await page.keyboard.press('Alt+KeyP');
  await expect(panel).toContainText('1 saved entry across 1 word');
  const [download] = await Promise.all([page.waitForEvent('download'), panel.getByRole('button', { name: 'Save file' }).click()]);
  expect(download.suggestedFilename()).toMatch(/^saved-entries-.+-\d{4}-\d{2}-\d{2}\.json$/);
  const path = await download.path();
  const data = JSON.parse(await (await import('node:fs/promises')).readFile(path!, 'utf8'));
  expect(data.format).toBe('arabic-reader-saved-entries');
  expect(data.words).toHaveLength(1);
  expect(data.words[0].saves).toHaveLength(1);
  expect(data.words[0].saves[0]).toMatchObject({ source: 'entry' });
  expect(JSON.stringify(data)).not.toMatch(/sentence|fsrs|installId/);
});
