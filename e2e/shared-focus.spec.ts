import { test, expect, type Page } from '@playwright/test';
import { sampleArabicBookPdf } from '../src/pdf/testPdf';

/** Shared Focus (src/readerTools): F, the pill, the tool rail from the shared tool list, in both readers. */
test.use({ viewport: { width: 1440, height: 900 } });

async function openSample(page: Page) {
  await page.goto('/');
  await page.waitForSelector('.navbar__settings', { timeout: 15000 });
  await page.locator('.navbar__item', { hasText: 'Library' }).click();
  await page.waitForSelector('text=Try the sample book', { timeout: 10000 });
  if ((await page.locator('.book-card').count()) === 0) await page.click('text=Try the sample book');
  await page.locator('.book-card').first().click();
  await page.waitForSelector('.qr-chapter .ar-word', { timeout: 15000 });
}

test('F enters Focus in the reader; Alt twice opens a rail with every tool, which opens drawers in Focus', async ({ page }) => {
  await openSample(page);
  await page.keyboard.press('f');
  const pill = page.getByRole('group', { name: 'Focus' });
  await expect(pill).toBeVisible();
  await expect(pill).toContainText(/Chapter|Page/);
  await expect(page.locator('.qr-dock')).toHaveCount(0);

  await page.keyboard.press('Alt');
  await page.keyboard.press('Alt');
  const rail = page.getByRole('navigation', { name: 'Reader tools' });
  await expect(rail).toBeVisible();
  for (const name of ['Contents', 'Search', 'Words', 'Margins', 'Document', 'Capture', 'Write', 'Sketch']) await expect(rail.getByRole('button', { name: new RegExp('^' + name) })).toBeVisible();

  // A drawer opens without leaving Focus.
  await rail.getByRole('button', { name: /^Contents/ }).click();
  await expect(page.locator('.qr-drawer')).toBeVisible();
  await expect(pill).toBeVisible();

  // Esc closes the rail first, then what is open, then Focus.
  await page.keyboard.press('Escape');
  await expect(rail).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.locator('.qr-drawer')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(pill).toHaveCount(0);
  await expect(page.locator('.qr-dock')).toBeVisible();
});

test('PDF pages: the dock has the shared tools and Focus; Focus hides the dock and the rail writes on the page', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('.navbar__settings', { timeout: 15000 });
  await page.setInputFiles('.library__actions input[type=file]', { name: 'reading.pdf', mimeType: 'application/pdf', buffer: Buffer.from(sampleArabicBookPdf()) });
  const card = page.locator('.book-card', { hasText: 'كتاب القراءة' });
  await expect(card).toHaveCount(1, { timeout: 30000 });
  await card.locator('.book-card__open').click();
  await expect(page.locator('.pdfp .qr-where--right')).toContainText('Page 1 of 3', { timeout: 20000 });

  const bar = page.locator('.pdfp .qr-dock');
  for (const name of ['Display', 'Pomodoro timer', 'Focus', 'Margins', 'Document', 'Write', 'Sketch']) await expect(bar.getByRole('button', { name, exact: true })).toBeVisible();
  await bar.getByRole('button', { name: 'Focus', exact: true }).click();
  await expect(page.locator('.pdfp .qr-dock')).toHaveCount(0);
  await expect(page.locator('.pdfp .qr-header')).toHaveCount(0);
  const pill = page.getByRole('group', { name: 'Focus' });
  await expect(pill).toContainText('Page 1 of 3');

  await pill.getByRole('button', { name: 'Tools' }).click();
  await page.getByRole('navigation', { name: 'Reader tools' }).getByRole('button', { name: /^Write/ }).click();
  await expect(page.getByRole('toolbar', { name: 'Write on the page' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('toolbar', { name: 'Write on the page' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(pill).toHaveCount(0);
  await expect(page.locator('.pdfp .qr-dock')).toBeVisible();
});
