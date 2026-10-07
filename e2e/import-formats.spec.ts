import { test, expect, type Page } from '@playwright/test';
import { useOriginalReader } from './originalReader';
import { makePdf, type PdfTestLine } from '../src/importFormats/testPdf';

test.beforeEach(async ({ page }) => useOriginalReader(page));

async function addFile(page: Page, name: string, text: string | Uint8Array, mimeType = 'text/plain') {
  await page.goto('/');
  await page.waitForSelector('.navbar__settings', { timeout: 15000 });
  await page.setInputFiles('.library__actions input[type=file]', { name, mimeType, buffer: typeof text === 'string' ? Buffer.from(text, 'utf-8') : Buffer.from(text) });
}

/** A small text PDF: one chapter heading and two paragraphs on each of three pages, drawn right to left. */
function arabicPdf(): Uint8Array {
  const sentences = [
    'ذهب الولد الصغير إلى المدرسة في الصباح الباكر مع أخيه الكبير وكان الطريق طويلا بين البيوت القديمة والأشجار العالية.',
    'رجع الولد إلى البيت بعد الظهر وجلس مع أمه في الحديقة الجميلة وحكى لها قصة الكتاب الجديد.',
  ];
  const wrap = (text: string) => {
    const out: string[] = [];
    let line = '';
    for (const word of text.split(' ')) {
      if (line && line.length + word.length + 1 > 56) {
        out.push(line);
        line = word;
      } else {
        line = line ? `${line} ${word}` : word;
      }
    }
    return [...out, line];
  };
  const pages = ['الفصل الأول', 'الفصل الثاني', 'الفصل الثالث'].map((title) => {
    const lines: PdfTestLine[] = [{ text: title, x: 540, y: 720, size: 22, rtl: true }];
    let y = 680;
    for (const sentence of sentences) {
      wrap(sentence).forEach((text, i) => lines.push({ text, x: i === 0 ? 516 : 540, y: (y -= 18), rtl: true }));
      y -= 14;
    }
    return { lines };
  });
  return makePdf(pages, { title: 'كتاب القراءة' });
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

test('a text PDF is converted to a reflowed book with a chapter per heading, and its words can be looked up', async ({ page }) => {
  await addFile(page, 'reading.pdf', arabicPdf(), 'application/pdf');
  const card = page.locator('.book-card', { hasText: 'كتاب القراءة' });
  await expect(card).toHaveCount(1, { timeout: 30000 });
  await expect(page.locator('.library__notice', { hasText: 'converted from PDF · 3 pages' })).toBeVisible();
  await card.locator('.book-card__open').click();
  await tapFirstWord(page);
});

test('a scanned PDF is refused with a clear message', async ({ page }) => {
  await addFile(page, 'scan.pdf', makePdf([{ image: true }, { image: true }]), 'application/pdf');
  await expect(page.locator('.library__error')).toContainText('This PDF is scanned images', { timeout: 30000 });
  await expect(page.locator('.book-card')).toHaveCount(0);
});

test('an unsupported file explains which types work', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('.navbar__settings', { timeout: 15000 });
  await page.setInputFiles('.library__actions input[type=file]', { name: 'letter.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: Buffer.from('PK') });
  await expect(page.locator('.library__error')).toContainText('EPUB, PDF, TXT, Markdown, MOBI or AZW3');
});
