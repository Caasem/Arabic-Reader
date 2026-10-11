import { test, expect, type Page } from '@playwright/test';

/**
 * Since 0.96.0 the new reader is the only one. Preferences saved when an old reader was chosen (before or after
 * preference migration 1 of 0.95.0) still open books in it, keep everything else, and show no notice; Settings no
 * longer offers the old readers.
 */
test.use({ viewport: { width: 1440, height: 900 } });

/** Preferences as an older version saved them. Seeded only into an empty mirror. */
function seedOldPrefs(page: Page, prefs: Record<string, unknown>) {
  return page.addInitScript((seed) => {
    const key = 'arabic-reader:preferences';
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(seed));
  }, prefs);
}

const storedPrefs = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('arabic-reader:preferences') ?? 'null') as Record<string, unknown> | null);

async function openSample(page: Page) {
  await page.goto('/');
  await page.waitForSelector('.navbar__settings', { timeout: 15000 });
  await page.locator('.navbar__item', { hasText: 'Library' }).click();
  await page.waitForSelector('text=Try the sample book', { timeout: 10000 });
  if ((await page.locator('.book-card').count()) === 0) await page.click('text=Try the sample book');
  await page.locator('.book-card').first().click();
}

for (const [who, seed] of [
  ['the old clean reader, before migrations', { quietReaderEnabled: false, cleanReaderEnabled: true, theme: 'sepia' }],
  ['Original layout, before migrations', { quietReaderEnabled: false, cleanReaderEnabled: false, theme: 'sepia' }],
  ['the old clean reader after Switch back', { quietReaderEnabled: false, cleanReaderEnabled: true, newReaderSwitchBack: null, prefsMigrations: 1, theme: 'sepia' }],
] as const) {
  test(`someone who had ${who} reads in the new reader, with their other settings`, async ({ page }) => {
    await seedOldPrefs(page, seed);
    await openSample(page);
    await page.waitForSelector('.qr-chapter .ar-word', { timeout: 15000 });
    await expect(page.locator('.new-reader-notice')).toHaveCount(0);
    expect(await storedPrefs(page)).toMatchObject({ theme: 'sepia', prefsMigrations: 1 });
  });
}

test('Settings has no reader to choose and nothing marked Legacy', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('.navbar__settings', { timeout: 15000 });
  await page.click('.navbar__settings');
  await page.waitForSelector('.settings-panel', { timeout: 5000 });
  await expect(page.locator('.settings-toggle', { hasText: 'New reader' })).toHaveCount(0);
  await expect(page.locator('.settings-toggle', { hasText: 'Read books as clean text' })).toHaveCount(0);
  await expect(page.locator('.settings-panel')).not.toContainText('Legacy');
  // The reader's own section stays, with the dock choice.
  await expect(page.locator('.settings-panel')).toContainText('Dock');
});
