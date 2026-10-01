import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const fontsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'fonts');
// The bundled (OFL) Latin subset stands in for a font someone uploads. WOFF2
// keeps its names compressed, so the choice is named after the file.
const UPLOAD = path.join(fontsDir, 'NotoNaskhArabic-latin.woff2');
const UPLOADED_FAMILY = 'NotoNaskhArabic latin (uploaded)';

const bookBodyFont = (page: Page) =>
  page.evaluate(() => {
    const doc = document.querySelector<HTMLIFrameElement>('.reader__epub iframe')?.contentDocument;
    return doc ? getComputedStyle(doc.body).fontFamily : null;
  });

/** Whether the uploaded @font-face actually loads inside the book's section document. */
const bookLoadsUploadedFont = (page: Page) =>
  page.evaluate(async (family) => {
    const doc = document.querySelector<HTMLIFrameElement>('.reader__epub iframe')?.contentDocument;
    if (!doc?.getElementById('ar-user-fonts')) return false;
    return (await doc.fonts.load(`16px '${family}'`, 'abc')).length > 0;
  }, UPLOADED_FAMILY);

const appArabicFont = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--font-arabic').trim());

async function openSampleBook(page: Page) {
  await page.goto('/');
  await page.waitForSelector('.navbar__settings', { timeout: 15000 });
  await page.locator('.navbar__item', { hasText: 'Library' }).click();
  await page.waitForSelector('text=Try the sample book', { timeout: 10000 });
  if ((await page.locator('.book-card').count()) === 0) await page.click('text=Try the sample book');
  await page.waitForSelector('.book-card', { timeout: 15000 });
  await page.locator('.book-card').first().click();
  await page.waitForSelector('.reader__epub iframe', { timeout: 15000 });
}

async function openFontSettings(page: Page) {
  await page.click('.navbar__settings');
  await page.waitForSelector('.settings-panel', { timeout: 5000 });
  const section = page.locator('.settings-section', { has: page.locator('h3', { hasText: /^Font$/ }) });
  await section.scrollIntoViewIfNeeded();
  return section;
}

test('an uploaded font becomes the reading font, survives a reload, and can be removed', async ({ page }) => {
  await openSampleBook(page);
  await expect.poll(() => bookBodyFont(page)).toContain('Noto Naskh Arabic');

  let section = await openFontSettings(page);
  await expect(section.getByRole('radio', { name: /Noto Naskh Arabic/ })).toHaveAttribute('aria-checked', 'true');

  // Not a font: refused with a message, nothing changes.
  await section.locator('input[type="file"]').setInputFiles(path.join(fontsDir, '..', 'favicon.svg'));
  await expect(section.locator('.font-settings__message--error')).toContainText("isn't a font");

  await section.locator('input[type="file"]').setInputFiles(UPLOAD);
  const uploaded = section.getByRole('radio', { name: /NotoNaskhArabic latin/ });
  await expect(uploaded).toHaveAttribute('aria-checked', 'true');
  await expect(section.locator('.font-settings__message')).toContainText('Added NotoNaskhArabic latin');

  // The book and, by default, the rest of the app use it.
  await expect.poll(() => bookBodyFont(page)).toContain(UPLOADED_FAMILY);
  await expect.poll(() => bookLoadsUploadedFont(page)).toBe(true);
  await expect.poll(() => appArabicFont(page)).toContain(UPLOADED_FAMILY);

  await section.locator('label', { hasText: 'Use for all Arabic text' }).locator('input').uncheck();
  await expect.poll(() => appArabicFont(page)).not.toContain(UPLOADED_FAMILY);
  await section.locator('label', { hasText: 'Use for all Arabic text' }).locator('input').check();
  await page.click('.settings-panel__close');

  // After a reload the font comes back from storage, into the book too.
  await openSampleBook(page);
  await expect.poll(() => bookBodyFont(page)).toContain(UPLOADED_FAMILY);
  await expect.poll(() => bookLoadsUploadedFont(page)).toBe(true);

  // Removing it (two presses) falls back to the built-in font.
  section = await openFontSettings(page);
  const remove = section.getByRole('button', { name: /Remove NotoNaskhArabic latin/ });
  await remove.click();
  await section.getByRole('button', { name: /Confirm removing NotoNaskhArabic latin/ }).click();
  await expect(section.getByRole('radio', { name: /NotoNaskhArabic latin/ })).toHaveCount(0);
  await expect(section.getByRole('radio', { name: /Noto Naskh Arabic/ })).toHaveAttribute('aria-checked', 'true');
  await page.click('.settings-panel__close');

  await expect.poll(() => bookBodyFont(page)).toContain('Noto Naskh Arabic');
  await expect.poll(() => bookBodyFont(page)).not.toContain(UPLOADED_FAMILY);
  await expect.poll(() => appArabicFont(page)).not.toContain(UPLOADED_FAMILY);
});
