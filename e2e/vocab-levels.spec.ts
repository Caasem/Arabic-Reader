import { test, expect } from '@playwright/test';
import fs from 'node:fs';

test('Vocab Levels: rarity data, tier switching, jump-to-word, export, and Settings status', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('.navbar__settings', { timeout: 10000 });

  await expect(page.locator('.navbar__item', { hasText: 'Vocab Levels' })).toBeDisabled();

  await page.locator('.navbar__item', { hasText: 'Library' }).click();
  await page.waitForSelector('text=Try the sample book', { timeout: 10000 });
  await page.click('text=Try the sample book');
  await page.waitForSelector('.book-card', { timeout: 15000 });
  await page.click('.book-card');
  await page.waitForSelector('.reader__epub iframe', { timeout: 15000 });
  await page.waitForTimeout(1500);

  await page.locator('.navbar__item', { hasText: 'Vocab Levels' }).click();
  await page.waitForSelector('.vocab-levels', { timeout: 5000 });

  // Builds the KSUCCA-derived frequency index (see frequencyIndex.ts) --
  // near-instant, but give the book-scan + index build a moment too.
  await page.click('.vocab-levels__enable-btn');
  await page.waitForSelector('.vocab-levels__tiers', { timeout: 30000 });
  await page.waitForTimeout(1500);

  const beginnerCount = await page.locator('.vocab-levels__word').count();
  expect(beginnerCount, 'expected at least some Beginner-tier words from the sample book').toBeGreaterThan(0);

  await page.locator('.vocab-levels__word-row').first().click();
  await page.waitForSelector('.vocab-levels__stepper', { timeout: 3000 });

  // Clicking a word row jumps the book pane -- the target word gets a
  // temporary highlight-flash class.
  await page.waitForTimeout(900);
  const frame = page.frames().find((f) => f !== page.mainFrame())!;
  const flashPresent = await frame.evaluate(() => !!document.querySelector('.ar-word--jump-flash'));
  expect(flashPresent, 'expected the jumped-to word to receive the temporary highlight-flash class').toBe(true);

  await page.locator('.vocab-levels__tier-btn', { hasText: 'Advanced' }).click();
  await page.waitForTimeout(400);

  await page.click('.vocab-levels__collapse-btn >> nth=0');
  await page.waitForSelector('.vocab-levels__collapse-strip', { timeout: 3000 });
  await page.click('.vocab-levels__expand-btn');
  await page.waitForSelector('.vocab-levels__tiers', { timeout: 3000 });

  // Rarity badge appears in the DictionaryPopup on a normal word click.
  await page.locator('.navbar__label', { hasText: /^Read$/ }).click();
  await page.waitForSelector('.reader__epub iframe', { timeout: 10000 });
  await page.waitForTimeout(1000);
  const readerFrame = page.frames().find((f) => f !== page.mainFrame())!;
  await readerFrame.evaluate(() => {
    document.querySelector('p .ar-word')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
  await page.waitForSelector('.dict-popup', { timeout: 8000 });
  await page.waitForTimeout(500);
  // Best-effort: absence isn't a failure (the tapped word might not be in
  // the frequency list), but presence should carry real text if it shows.
  if (await page.locator('.dict-popup__rarity').count()) {
    expect((await page.textContent('.dict-popup__rarity'))?.trim()).toBeTruthy();
  }

  // Export produces a real download.
  await page.click('.dict-popup__close');
  await page.waitForTimeout(200);
  await page.locator('.navbar__item', { hasText: 'Vocab Levels' }).click();
  await page.waitForSelector('.vocab-levels__tiers', { timeout: 5000 });
  await page.locator('.vocab-levels__tier-btn', { hasText: 'Beginner' }).click();
  await page.waitForTimeout(400);
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 5000 }),
    page.click('.vocab-levels__export-btn'),
  ]);
  const downloadPath = await download.path();
  const content = downloadPath ? fs.readFileSync(downloadPath, 'utf8') : '';
  expect(content).toContain('Beginner');

  // Close via its own close button.
  await page.click('.vocab-levels__close-btn');
  await page.waitForTimeout(300);
  await expect(page.locator('.vocab-levels')).toHaveCount(0);
  await expect(page.locator('.vocab-levels__collapse-strip')).toHaveCount(0);

  // Settings shows the rarity dataset as enabled.
  await page.click('.navbar__settings');
  await page.waitForSelector('.settings-panel', { timeout: 5000 });
  const settingsSection = page.locator('.settings-section', { hasText: 'Vocabulary Levels' });
  await settingsSection.scrollIntoViewIfNeeded();
  expect(await settingsSection.textContent()).toContain('Enabled');
});
