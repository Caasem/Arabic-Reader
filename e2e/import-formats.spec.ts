import { test, expect, type Page } from '@playwright/test';
import { useOriginalReader } from './originalReader';

test.beforeEach(async ({ page }) => useOriginalReader(page));

async function addFile(page: Page, name: string, text: string) {
  await page.goto('/');
  await page.waitForSelector('.navbar__settings', { timeout: 15000 });
  await page.setInputFiles('.library__actions input[type=file]', { name, mimeType: 'text/plain', buffer: Buffer.from(text, 'utf-8') });
}

async function tapFirstWord(page: Page) {
  await page.waitForSelector('.reader__epub iframe', { timeout: 30000 });
  await page.waitForTimeout(2000);
  const frame = page.frames().find((f) => f !== page.mainFrame())!;
  await frame.waitForSelector('.ar-word', { timeout: 15000 });
  await frame.evaluate(() => document.querySelector('.ar-word')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));
  await expect(page.locator('.dict-popup')).toBeVisible({ timeout: 8000 });
}

test('a TXT file is converted to a book with chapters, and its words can be looked up', async ({ page }) => {
  const text = ['قصة قصيرة', 'الفصل الأول', 'ذهب الولد إلى المدرسة في الصباح الباكر مع أخيه.', 'الفصل الثاني', 'رجع الولد إلى البيت بعد الظهر وقرأ كتابا.'].join('\n\n');
  await addFile(page, 'story.txt', text);
  const card = page.locator('.book-card', { hasText: 'قصة قصيرة' });
  await expect(card).toHaveCount(1, { timeout: 15000 });
  await expect(page.locator('.library__notice', { hasText: 'converted from TXT · 2 chapters' })).toBeVisible();
  await card.locator('.book-card__open').click();
  await tapFirstWord(page);
});

test('a Markdown file is converted, with headings as chapters', async ({ page }) => {
  await addFile(page, 'notes.md', '---\ntitle: ملاحظات الدرس\n---\n## الدرس الأول\n\nقرأ **الطالب** الكتاب.\n\n## الدرس الثاني\n\nكتب الطالب الدرس.');
  const card = page.locator('.book-card', { hasText: 'ملاحظات الدرس' });
  await expect(card).toHaveCount(1, { timeout: 15000 });
  await expect(page.locator('.library__notice', { hasText: 'converted from MD · 2 chapters' })).toBeVisible();
  await card.locator('.book-card__open').click();
  await tapFirstWord(page);
});

test('an unsupported file explains which types work', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('.navbar__settings', { timeout: 15000 });
  await page.setInputFiles('.library__actions input[type=file]', { name: 'scan.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') });
  await expect(page.locator('.library__error')).toContainText('EPUB, TXT, Markdown, MOBI or AZW3');
});
