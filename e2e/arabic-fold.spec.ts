import { test, expect, type Page } from '@playwright/test';

/**
 * Clean popup: when more than two Arabic definitions (Al-Wasit, Al-Sihah,
 * Maqayis) show at once they start folded to their headword rows; a setting
 * turns that off. See src/popupClean.
 */
async function openWordWithManyArabicEntries(page: Page, collapse: boolean) {
  await page.addInitScript((collapseMany) => {
    localStorage.setItem(
      'arabic-reader:preferences',
      JSON.stringify({
        enabledProviderIds: ['aramorph', 'alwasit', 'alsihah', 'almaqayis'],
        collapseManyArabicEntries: collapseMany,
      })
    );
  }, collapse);
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.waitForSelector('text=Try the sample book', { timeout: 10000 });
  await page.click('text=Try the sample book');
  await page.waitForSelector('.book-card', { timeout: 15000 });
  await page.click('.book-card');
  await page.waitForSelector('.qr-chapter .ar-word', { timeout: 30000 });
  const words = page.locator('.qr-chapter p .ar-word');
  const count = await words.count();
  for (let i = 0; i < Math.min(count, 60); i++) {
    await words.nth(i).click();
    await page.waitForSelector('.dict-popup', { timeout: 8000 });
    await page.waitForTimeout(1500);
    if ((await page.locator('.dict-popup__headword--toggle').count()) > 2) return;
    await page.click('.dict-popup__close');
  }
  throw new Error('no word in the sample book has more than two Arabic entries');
}

test('more than two Arabic entries start folded, and a headword opens one', async ({ page }) => {
  await openWordWithManyArabicEntries(page, true);
  const headwords = page.locator('.dict-popup__headword--toggle');
  const n = await headwords.count();
  for (let i = 0; i < n; i++) await expect(headwords.nth(i)).toHaveAttribute('aria-expanded', 'false');
  await headwords.first().click();
  await expect(headwords.first()).toHaveAttribute('aria-expanded', 'true');
  await expect(headwords.nth(1)).toHaveAttribute('aria-expanded', 'false');
});

test('with the setting off, every Arabic entry starts open', async ({ page }) => {
  await openWordWithManyArabicEntries(page, false);
  const headwords = page.locator('.dict-popup__headword--toggle');
  const n = await headwords.count();
  for (let i = 0; i < n; i++) await expect(headwords.nth(i)).toHaveAttribute('aria-expanded', 'true');
});
