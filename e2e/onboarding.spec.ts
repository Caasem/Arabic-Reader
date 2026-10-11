import { test, expect, type Page } from '@playwright/test';

/**
 * First-run welcome (src/onboarding): a four-slide showcase, then device and
 * dictionaries. Every other spec runs as a returning user (see
 * playwright.config.ts); these start from an empty browser.
 */
const emptyStorage = { cookies: [], origins: [] };
test.use({ storageState: emptyStorage, viewport: { width: 1280, height: 900 } });

const prefs = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('arabic-reader:preferences') ?? 'null') as Record<string, unknown> | null);

async function throughShowcase(page: Page) {
  await expect(page.getByRole('heading', { name: 'Read. Tap. Remember.' })).toBeVisible();
  for (const title of ['Tap a word. Keep reading.', 'Search without leaving the page.', 'Learn it. Remember it.']) {
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page.getByRole('heading', { name: title })).toBeVisible();
  }
  await page.getByRole('button', { name: 'Next' }).click();
}

test('a first visit walks the showcase, then applies the chosen device and dictionaries', async ({ page }) => {
  await page.goto('/');
  await throughShowcase(page);

  // Playwright's browser is a desktop: it is the recommended card, but any can be picked.
  await expect(page.getByRole('heading', { name: 'What are you reading on?' })).toBeVisible();
  await expect(page.locator('.ob-choice', { hasText: 'Desktop' }).locator('.ob-rec')).toHaveText('Recommended');
  await page.getByRole('button', { name: 'Next' }).click();

  await expect(page.getByRole('heading', { name: 'Which dictionaries would you like?' })).toBeVisible();
  await expect(page.getByLabel('English–Arabic')).toBeDisabled();
  await page.getByLabel('Al-Wasīṭ').check();
  await expect(page.locator('.ob-summary')).toHaveText('Desktop · English–Arabic · Al-Wasīṭ');
  await page.getByRole('button', { name: 'Set up my reading space' }).click();

  await page.waitForSelector('.navbar');
  const saved = await prefs(page);
  expect(saved).toMatchObject({ readingWidthPct: 65, hoverPreviewEnabled: true, quietReaderEnabled: true, enabledProviderIds: ['aramorph', 'alwasit'] });
  await expect(page.locator('.navbar')).not.toHaveClass(/navbar--collapsed/);
  // The starter books are already on the shelf.
  await expect(page.locator('.book-card__title', { hasText: 'نَارَادَا' })).toBeVisible({ timeout: 15000 });
  await expect(page.locator('.book-card__title', { hasText: 'قصص النبيين للأطفال' })).toBeVisible();
  await expect(page.locator('.book-card__title', { hasText: 'الأخبار الطوال' })).toBeVisible();
});

async function setUpAs(page: Page, device: 'Phone' | 'Tablet') {
  await page.goto('/');
  await page.getByRole('button', { name: 'Skip intro' }).click();
  await page.locator('.ob-choice', { hasText: device }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Set up my reading space' }).click();
  await page.waitForSelector('.navbar');
}

/** Opens the first starter book and waits for the new reader's text. */
async function opensInNewReader(page: Page) {
  await page.locator('.book-card').first().click({ timeout: 15000 });
  await page.waitForSelector('.qr-chapter .ar-word', { timeout: 20000 });
  await expect(page.locator('.new-reader-notice')).toHaveCount(0);
}

test('choosing Phone applies the touch starting layout and a collapsed sidebar, and reads in the new reader', async ({ page }) => {
  await setUpAs(page, 'Phone');
  expect(await prefs(page)).toMatchObject({ readingWidthPct: 100, hoverPreviewEnabled: false, cleanReaderEnabled: false, quietReaderEnabled: true });
  await expect(page.locator('.navbar')).toHaveClass(/navbar--collapsed/);
  await opensInNewReader(page);
});

test('choosing Tablet reads in the new reader too', async ({ page }) => {
  await setUpAs(page, 'Tablet');
  expect(await prefs(page)).toMatchObject({ readingWidthPct: 80, cleanReaderEnabled: false, quietReaderEnabled: true });
  await opensInNewReader(page);
});

test('skipping uses the recommended layout with only the essential dictionary, and never returns', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Skip intro' }).click();
  await page.getByRole('button', { name: 'Skip for now' }).click();
  await page.waitForSelector('.navbar');
  expect((await prefs(page))?.enabledProviderIds).toEqual(['aramorph']);
  await page.reload();
  await page.waitForSelector('.navbar');
  await expect(page.locator('.ob')).toHaveCount(0);
});

test('an install that already has preferences never sees the welcome', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('arabic-reader:preferences', JSON.stringify({ readingWidthPct: 90 })));
  await page.goto('/');
  await page.waitForSelector('.navbar');
  await expect(page.locator('.ob')).toHaveCount(0);
  expect((await prefs(page))?.readingWidthPct).toBe(90);
});

test('an existing install gets the starter books once, and removing one keeps it gone', async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('arabic-reader:preferences')) localStorage.setItem('arabic-reader:preferences', JSON.stringify({ readingWidthPct: 90 }));
  });
  await page.goto('/');
  const card = page.locator('.book-card', { hasText: 'نَارَادَا' });
  await expect(card).toBeVisible({ timeout: 15000 });
  // Remove lives in the book's details since the Library redesign.
  await card.getByRole('button', { name: /^Details for/ }).click();
  await page.getByRole('button', { name: /Remove from library/ }).click();
  await page.getByRole('button', { name: /^remove$/i }).click();
  await expect(card).toHaveCount(0);
  await page.reload();
  await page.waitForSelector('.navbar');
  await expect(page.locator('.book-card', { hasText: 'قصص النبيين للأطفال' })).toBeVisible();
  await expect(page.locator('.book-card', { hasText: 'نَارَادَا' })).toHaveCount(0);
});
