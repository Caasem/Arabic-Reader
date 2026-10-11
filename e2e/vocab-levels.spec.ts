import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';

async function openSampleBook(page: Page) {
  await page.goto('/');
  await page.waitForSelector('.navbar__settings', { timeout: 10000 });

  await expect(page.locator('.navbar__item', { hasText: 'Vocab Levels' })).toBeDisabled();

  await page.locator('.navbar__item', { hasText: 'Library' }).click();
  await page.waitForSelector('text=Try the sample book', { timeout: 10000 });
  await page.click('text=Try the sample book');
  await page.waitForSelector('.book-card', { timeout: 15000 });
  await page.click('.book-card');
  await page.waitForSelector('.qr-chapter .ar-word', { timeout: 15000 });

  await page.locator('.navbar__item', { hasText: 'Vocab Levels' }).click();
  await page.getByRole('complementary', { name: 'Vocab levels' }).waitFor({ timeout: 5000 });
}

// The old panel could fold to a thin strip and open again; the new one only opens and closes.
test.fixme('Vocab Levels: the panel collapses to a strip and expands again', async ({ page }) => {
  await openSampleBook(page);
  await page.getByRole('button', { name: 'Turn on vocab levels' }).click();
  await page.waitForSelector('.vocab-levels__tiers', { timeout: 30000 });

  await page.click('.vocab-levels__collapse-btn >> nth=0');
  await page.waitForSelector('.vocab-levels__collapse-strip', { timeout: 3000 });
  await page.click('.vocab-levels__expand-btn');
  await page.waitForSelector('.vocab-levels__tiers', { timeout: 3000 });
});

test('Vocab Levels: rarity data, tier switching, jump-to-word, export, and Settings status', async ({ page }) => {
  await openSampleBook(page);
  const levels = page.getByRole('complementary', { name: 'Vocab levels' });

  // Builds the KSUCCA-derived frequency index (see frequencyIndex.ts) --
  // near-instant, but give the book-scan + index build a moment too.
  await levels.getByRole('button', { name: 'Turn on vocab levels' }).click();
  await page.waitForSelector('.qr-levels__tiers', { timeout: 30000 });
  await levels.getByRole('button', { name: 'Beginner' }).click();
  await expect(levels.locator('.qr-levels__row').first()).toBeVisible({ timeout: 20000 });

  const beginnerCount = await levels.locator('.qr-levels__word').count();
  expect(beginnerCount, 'expected at least some Beginner-tier words from the sample book').toBeGreaterThan(0);

  // Pressing a word's jump button moves the book pane to it and says which occurrence it is on.
  await levels.locator('.qr-levels__row').first().getByRole('button', { name: 'Show in the book' }).click();
  await expect(levels.locator('.qr-levels__row').first().getByRole('button', { name: 'Show in the book' })).toHaveAttribute('title', /1 of \d+/);

  // The word it lands on gets a temporary highlight flash.
  const flashPresent = await page.evaluate(() => CSS.highlights.has('qr-flash'));
  expect(flashPresent, 'expected the jumped-to word to receive the temporary highlight flash').toBe(true);

  await levels.getByRole('button', { name: 'Advanced' }).click();
  await page.waitForTimeout(400);

  // Rarity badge appears in the DictionaryPopup on a normal word click.
  await page.locator('.navbar__label', { hasText: /^Read$/ }).click();
  await page.waitForSelector('.qr-chapter .ar-word', { timeout: 10000 });
  await page.locator('.qr-chapter p .ar-word').first().click();
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
  await page.waitForSelector('.qr-levels__tiers', { timeout: 5000 });
  await levels.getByRole('button', { name: 'Beginner' }).click();
  await page.waitForTimeout(400);
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 5000 }),
    levels.getByRole('button', { name: 'Export these words' }).click(),
  ]);
  const downloadPath = await download.path();
  const content = downloadPath ? fs.readFileSync(downloadPath, 'utf8') : '';
  expect(content).toContain('Beginner');

  // Close via its own close button.
  await levels.getByRole('button', { name: 'Close vocab levels' }).click();
  await page.waitForTimeout(300);
  await expect(levels).toHaveCount(0);

  // Settings shows the rarity dataset as enabled.
  await page.click('.navbar__settings');
  await page.waitForSelector('.settings-panel', { timeout: 5000 });
  const settingsSection = page.locator('.settings-section', { hasText: 'Vocabulary Levels' });
  await settingsSection.scrollIntoViewIfNeeded();
  expect(await settingsSection.textContent()).toContain('Enabled');
});
