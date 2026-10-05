import { test, expect, type Locator } from '@playwright/test';
import { useOriginalReader } from './originalReader';

test.beforeEach(async ({ page }) => useOriginalReader(page));

const entryText = async (entry: Locator) => (await entry.innerText()).replace(/[+✓]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80);

/**
 * The entry a reader saves with its round + comes first in its dictionary the next time the same word is
 * opened in the same book. Nothing is added to the popup: the same buttons are there before and after.
 * The sample book is searched word by word for a dictionary that returns three or more entries.
 */
test('a saved entry comes first the next time the word is opened', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.waitForSelector('text=Try the sample book', { timeout: 10000 });
  await page.click('text=Try the sample book');
  await page.waitForSelector('.book-card', { timeout: 15000 });
  await page.click('.book-card');
  await page.waitForSelector('.reader__epub iframe', { timeout: 30000 });
  await page.waitForTimeout(2500);
  const frame = page.frames().find((f) => f !== page.mainFrame())!;
  const tap = async (n: number) => {
    await frame.evaluate((i) => document.querySelectorAll('p .ar-word')[i].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })), n);
    await page.waitForSelector('.dict-popup', { timeout: 8000 });
    await page.waitForTimeout(700);
  };

  // Find a word with a dictionary group holding at least three entries.
  const count = await frame.evaluate(() => document.querySelectorAll('p .ar-word').length);
  let word = -1;
  let groupIndex = -1;
  for (let i = 0; i < Math.min(count, 60) && word === -1; i++) {
    await tap(i);
    const sizes = await page.locator('.dict-popup__group').evaluateAll((gs) => gs.map((g) => g.querySelectorAll(':scope > .dict-popup__entry').length));
    const at = sizes.findIndex((n) => n >= 3);
    if (at !== -1) {
      word = i;
      groupIndex = at;
    } else {
      await page.click('.dict-popup__close');
    }
  }
  expect(word, 'a word with a dictionary that returns three or more entries turns up').toBeGreaterThanOrEqual(0);

  const entries = () => page.locator('.dict-popup__group').nth(groupIndex).locator(':scope > .dict-popup__entry');
  const buttonsBefore = await page.locator('.dict-popup button').count();
  const firstBefore = await entryText(entries().first());
  const third = entries().nth(2);
  const thirdText = await entryText(third);
  expect(thirdText).not.toBe(firstBefore);

  // Save the third entry with its round +.
  await third.locator('.dict-popup__entry-save').click();
  await expect(third.locator('.dict-popup__entry-save')).toHaveText('✓');
  await page.waitForTimeout(500);
  await page.click('.dict-popup__close');

  // Opened again, that entry leads its dictionary; the controls are exactly as before.
  await tap(word);
  expect(await entryText(entries().first())).toBe(thirdText);
  expect(await page.locator('.dict-popup button').count()).toBe(buttonsBefore);
});
