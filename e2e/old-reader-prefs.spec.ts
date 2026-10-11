import { test, expect, type Page } from '@playwright/test';

/**
 * Preference migration 1 (src/state/prefsMigrations.ts, 0.95.0): anyone with
 * "New reader" off is moved to it once, told so once, and can switch back
 * until the old readers go in phase 2b.
 */
test.use({ viewport: { width: 1440, height: 900 } });

/** Preferences saved before migrations existed: no `prefsMigrations`. Seeded only into an empty mirror. */
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

const notice = (page: Page) => page.locator('.new-reader-notice');

test('someone on the old clean reader is moved to the new reader once, and the notice goes for good', async ({ page }) => {
  await seedOldPrefs(page, { quietReaderEnabled: false, cleanReaderEnabled: true, theme: 'sepia' });
  await openSample(page);
  await page.waitForSelector('.qr-chapter .ar-word', { timeout: 15000 });
  await expect(notice(page)).toContainText('Books now open in the new reader');
  expect(await storedPrefs(page)).toMatchObject({ quietReaderEnabled: true, cleanReaderEnabled: false, prefsMigrations: 1, theme: 'sepia' });

  await notice(page).getByRole('button', { name: 'Keep the new reader' }).click();
  await expect(notice(page)).toHaveCount(0);

  await openSample(page);
  await page.waitForSelector('.qr-chapter .ar-word', { timeout: 15000 });
  await expect(notice(page)).toHaveCount(0);
});

test('Switch back returns to the reader they had, and the migration does not run again', async ({ page }) => {
  await seedOldPrefs(page, { quietReaderEnabled: false, cleanReaderEnabled: true });
  await openSample(page);
  await page.waitForSelector('.qr-chapter .ar-word', { timeout: 15000 });
  await notice(page).getByRole('button', { name: 'Switch back' }).click();
  await page.waitForSelector('.clean-reader__text', { timeout: 15000 });
  await expect(notice(page)).toHaveCount(0);

  await openSample(page);
  await page.waitForSelector('.clean-reader__text', { timeout: 15000 });
  expect(await storedPrefs(page)).toMatchObject({ quietReaderEnabled: false, cleanReaderEnabled: true, newReaderSwitchBack: null, prefsMigrations: 1 });
});

test('someone already on the new reader sees no notice', async ({ page }) => {
  await openSample(page);
  await page.waitForSelector('.qr-chapter .ar-word', { timeout: 15000 });
  await expect(notice(page)).toHaveCount(0);
});

test('Settings marks New reader off and the clean reader on as legacy', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('.navbar__settings', { timeout: 15000 });
  await page.click('.navbar__settings');
  await page.waitForSelector('.settings-panel', { timeout: 5000 });
  const legacy = page.locator('.settings-section__note--legacy');
  await expect(legacy).toHaveCount(0);

  await page.locator('.settings-toggle', { hasText: 'New reader' }).locator('input').uncheck();
  await expect(legacy).toHaveCount(1);
  await page.locator('.settings-toggle', { hasText: 'Read books as clean text' }).locator('input').check();
  await expect(legacy).toHaveCount(2);
  await expect(legacy.first()).toHaveText('Legacy, will be removed in a coming version.');
});
