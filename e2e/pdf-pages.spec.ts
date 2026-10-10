import { test, expect, type Page } from '@playwright/test';
import { makePdf, sampleArabicBookPdf } from '../src/pdf/testPdf';
import { turnOnPdfConvert } from './pdfConvert';

/** Books added from a PDF: the Original pages view (src/pdf/pages) and the switch from the reflowed text. */
test.use({ viewport: { width: 1440, height: 900 } });

async function addPdf(page: Page, name: string, data: Uint8Array, convert = false) {
  await page.goto('/');
  await page.waitForSelector('.navbar__settings', { timeout: 15000 });
  if (convert) await turnOnPdfConvert(page);
  await page.setInputFiles('.library__actions input[type=file]', { name, mimeType: 'application/pdf', buffer: Buffer.from(data) });
}

/** Clicks the middle of the first text run of the first page, which lands on a word. */
async function tapFirstWord(page: Page) {
  const run = page.locator('.pdfp-page[data-page="1"] .pdfp-text span').first();
  await run.waitFor({ state: 'attached', timeout: 20000 });
  await expect.poll(async () => (await run.boundingBox())?.width ?? 0, { timeout: 20000 }).toBeGreaterThan(20);
  const box = (await run.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator('.dict-popup')).toBeVisible({ timeout: 10000 });
}

test('a text PDF can be switched from reflowed text to its original pages, and words look up there', async ({ page }) => {
  await addPdf(page, 'reading.pdf', sampleArabicBookPdf(), true);
  const card = page.locator('.book-card', { hasText: 'كتاب القراءة' });
  await expect(card).toHaveCount(1, { timeout: 30000 });
  await card.locator('.book-card__open').click();
  await page.waitForSelector('.qr-chapter .ar-word', { timeout: 20000 });

  await page.locator('.qr-dock').getByRole('button', { name: 'Display', exact: true }).click();
  await page.getByRole('dialog', { name: 'Display' }).getByRole('button', { name: 'Original pages' }).click();

  await expect(page.locator('.pdfp .qr-where--right')).toContainText('Page 1 of 3', { timeout: 20000 });
  await expect(page.locator('.pdfp-page canvas').first()).toBeVisible();
  await tapFirstWord(page);

  // Next page, then back to the reflowed text.
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(page.locator('.pdfp .qr-where--right')).toContainText('Page 2 of 3');
  await page.locator('.qr-dock').getByRole('button', { name: 'Display', exact: true }).click();
  await page.getByRole('dialog', { name: 'Display' }).getByRole('button', { name: 'Reflowed text' }).click();
  await page.waitForSelector('.qr-chapter .ar-word', { timeout: 20000 });
});

test('a scanned PDF is added as pages and opens in the pages view', async ({ page }) => {
  await addPdf(page, 'scan.pdf', makePdf([{ image: true }, { image: true }]));
  const notice = page.locator('.library__notice', { hasText: 'added as PDF pages · 2 pages' });
  await expect(notice).toBeVisible({ timeout: 30000 });
  await page.locator('.book-card').first().locator('.book-card__open').click();
  await expect(page.locator('.pdfp .qr-where--right')).toContainText('Page 1 of 2', { timeout: 20000 });
  await expect(page.getByRole('button', { name: 'Reflowed text' })).toHaveCount(0);
});

/** Share of the page canvas that is not paper-coloured, so a blank page reads as 0. */
async function inkOf(page: Page, pageNumber: number): Promise<number> {
  return page.evaluate((n) => {
    const canvas = document.querySelector<HTMLCanvasElement>(`.pdfp-page[data-page="${n}"] canvas`);
    if (!canvas || !canvas.width) return 0;
    const { data } = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
    let ink = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i] < 200 || data[i + 1] < 200 || data[i + 2] < 200) ink++;
    return ink / (data.length / 4);
  }, pageNumber);
}

test('the original pages draw their text and images instead of coming up blank', async ({ page }) => {
  await addPdf(page, 'reading.pdf', sampleArabicBookPdf(), true);
  const card = page.locator('.book-card', { hasText: 'كتاب القراءة' });
  await expect(card).toHaveCount(1, { timeout: 30000 });
  await card.locator('.book-card__open').click();
  await page.waitForSelector('.qr-chapter .ar-word', { timeout: 20000 });
  await page.locator('.qr-dock').getByRole('button', { name: 'Display', exact: true }).click();
  await page.getByRole('dialog', { name: 'Display' }).getByRole('button', { name: 'Original pages' }).click();
  await expect(page.locator('.pdfp .qr-where--right')).toContainText('Page 1 of 3', { timeout: 20000 });
  await expect.poll(() => inkOf(page, 1), { timeout: 20000, message: 'text page has ink' }).toBeGreaterThan(0.001);
});

test('pdf.js data (decoders, fonts) ships with the app, so scanned books are not blank', async ({ page }) => {
  await page.goto('/');
  const found = await page.evaluate(async () => {
    const out: Record<string, string> = {};
    for (const file of ['wasm/jbig2.wasm', 'wasm/openjpeg.wasm', 'standard_fonts/FoxitSerif.pfb', 'cmaps/Adobe-Japan1-UCS2.bcmap']) {
      const res = await fetch(new URL(`pdfjs/${file}`, document.baseURI));
      const bytes = new Uint8Array(await res.arrayBuffer());
      out[file] = `${res.status} ${file.endsWith('.wasm') ? [...bytes.slice(0, 4)].join(',') : bytes.length > 100 ? 'ok' : 'tiny'}`;
    }
    return out;
  });
  expect(found).toEqual({
    'wasm/jbig2.wasm': '200 0,97,115,109',
    'wasm/openjpeg.wasm': '200 0,97,115,109',
    'standard_fonts/FoxitSerif.pfb': '200 ok',
    'cmaps/Adobe-Japan1-UCS2.bcmap': '200 ok',
  });
});

test('a PDF book opens from the Library as its pages or as text, and a scan offers only pages', async ({ page }) => {
  await addPdf(page, 'reading.pdf', sampleArabicBookPdf(), true);
  const card = page.locator('.book-card', { hasText: 'كتاب القراءة' });
  await expect(card).toHaveCount(1, { timeout: 30000 });
  const choice = card.getByRole('group', { name: /Open .* as/ });
  await expect(choice.getByRole('button')).toHaveText(['PDF', 'Text']);

  await choice.getByRole('button', { name: 'PDF' }).click();
  await expect(page.locator('.pdfp .qr-where--right')).toContainText('Page 1 of 3', { timeout: 20000 });
  await expect.poll(() => inkOf(page, 1), { timeout: 20000 }).toBeGreaterThan(0.001);

  await page.locator('.app__main').getByRole('button', { name: 'Library' }).first().click();
  await card.getByRole('group', { name: /Open .* as/ }).getByRole('button', { name: 'Text' }).click();
  await page.waitForSelector('.qr-chapter .ar-word', { timeout: 20000 });
  await expect(page.locator('.pdfp-page')).toHaveCount(0);

  // A scanned PDF has no text to switch to, so its card has no choice.
  await page.locator('.app__main').getByRole('button', { name: 'Library' }).first().click();
  await page.setInputFiles('.library__actions input[type=file]', { name: 'scan.pdf', mimeType: 'application/pdf', buffer: Buffer.from(makePdf([{ image: true }, { image: true }])) });
  const scan = page.locator('.book-card', { hasText: 'scan' });
  await expect(scan).toHaveCount(1, { timeout: 30000 });
  await expect(scan.getByRole('group', { name: /Open .* as/ })).toHaveCount(0);
});

test('by default a text PDF is added as its pages without converting, and opens straight into them', async ({ page }) => {
  await addPdf(page, 'reading.pdf', sampleArabicBookPdf());
  await expect(page.locator('.library__notice', { hasText: 'added as PDF pages · 3 pages' })).toBeVisible({ timeout: 30000 });
  const card = page.locator('.book-card', { hasText: 'كتاب القراءة' });
  await expect(card.getByRole('group', { name: /Open .* as/ })).toHaveCount(0);
  await card.locator('.book-card__open').click();
  await expect(page.locator('.pdfp .qr-where--right')).toContainText('Page 1 of 3', { timeout: 20000 });
  await expect(page.getByRole('button', { name: 'Reflowed text' })).toHaveCount(0);
  await tapFirstWord(page);
});

test('PDF pages have the reader’s dock in the same order; Contents and Search work on the pages', async ({ page }) => {
  await addPdf(page, 'reading.pdf', sampleArabicBookPdf());
  const card = page.locator('.book-card', { hasText: 'كتاب القراءة' });
  await expect(card).toHaveCount(1, { timeout: 30000 });
  await card.locator('.book-card__open').click();
  await expect(page.locator('.pdfp .qr-where--right')).toContainText('Page 1 of 3', { timeout: 20000 });

  const dock = page.locator('.pdfp .qr-dock');
  const names = await dock.locator('button').evaluateAll((buttons) => buttons.map((b) => b.getAttribute('aria-label')));
  expect(names).toEqual(['Contents', 'Search', 'Marks', 'Words', 'Display', 'Levels', 'Pomodoro timer', 'Focus', 'Margins', 'Document', 'Write', 'Sketch']);

  await dock.getByRole('button', { name: 'Contents', exact: true }).click();
  const drawer = page.locator('.qr-drawer');
  await expect(drawer).toContainText('Reading now · page 1');
  await drawer.getByRole('button', { name: /^Page 3/ }).click();
  await expect(page.locator('.pdfp .qr-where--right')).toContainText('Page 3 of 3');

  await drawer.getByRole('tab', { name: 'Search' }).click();
  await drawer.locator('input').fill('الحديقة');
  await expect(drawer).toContainText('3 matches', { timeout: 10000 });
  await drawer.locator('.qr-result').first().click();
  await expect(page.locator('.pdfp .qr-where--right')).toContainText('Page 1 of 3');
});
