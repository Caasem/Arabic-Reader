import { test, expect, type Page } from '@playwright/test';
import { sampleArabicBookPdf } from '../src/pdf/testPdf';

/** Ink and sketches (src/annotate): writing on the page (Alt+W) and the sketch sheet beside it (Alt+K). */
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

/** After a reload the app opens on the library: open the sample book again. */
async function reopen(page: Page) {
  await page.reload();
  await page.waitForSelector('.navbar__settings', { timeout: 15000 });
  if (!(await page.locator('.qr-chapter .ar-word').count())) {
    await page.locator('.navbar__item', { hasText: 'Library' }).click();
    await page.locator('.book-card').first().click();
  }
  await page.waitForSelector('.qr-chapter .ar-word', { timeout: 15000 });
}

/** A short wavy stroke with the mouse, in many small moves. */
async function scribble(page: Page, x: number, y: number, length = 160) {
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 16; i++) await page.mouse.move(x + (i * length) / 16, y + Math.sin(i / 2) * 6);
  await page.mouse.up();
}

/** The first word's box and the stroke group's origin, both relative to the reader's stage. */
async function strokeAndWord(page: Page) {
  return page.evaluate(() => {
    const stage = document.querySelector('.qr .qr-stage')!.getBoundingClientRect();
    const g = document.querySelector('.ink-clean svg > g[transform]:not(:last-child)');
    const m = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(g?.getAttribute('transform') ?? '');
    return m ? { x: Number(m[1]) + stage.left, y: Number(m[2]) + stage.top } : null;
  });
}

test('Alt+W writes on the text; the ink stays with its word and lookups come back after Done', async ({ page }) => {
  await openSample(page);
  const word = page.locator('.qr-chapter p .ar-word').first();
  const box = (await word.boundingBox())!;

  await page.keyboard.press('Alt+w');
  await expect(page.getByRole('toolbar', { name: 'Write on the page' })).toBeVisible();
  await scribble(page, box.x + box.width / 2 - 80, box.y + box.height + 2);
  await expect(page.locator('.ink-clean .ink-stroke[d^="M"]')).toHaveCount(1, { timeout: 5000 });

  // Undo takes it off, Redo puts it back.
  await page.getByRole('button', { name: 'Undo (Ctrl+Z)' }).click();
  await expect(page.locator('.ink-clean .ink-stroke[d^="M"]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Redo (Ctrl+Shift+Z)' }).click();
  await expect(page.locator('.ink-clean .ink-stroke[d^="M"]')).toHaveCount(1);

  // A narrower window reflows the text: the stroke moves with its word.
  const before = await strokeAndWord(page);
  await page.setViewportSize({ width: 1000, height: 900 });
  await expect.poll(async () => JSON.stringify(await strokeAndWord(page)), { timeout: 5000 }).not.toBe(JSON.stringify(before));
  const tied = await page.evaluate(() => {
    const g = document.querySelector('.ink-clean svg > g[transform]:not(:last-child) path')!.getBoundingClientRect();
    const words = Array.from(document.querySelectorAll('.qr-chapter .ar-word')).map((w) => w.getBoundingClientRect());
    // Some word sits right above the stroke's start (within two lines).
    return words.some((w) => Math.abs(w.bottom - g.top) < 60 && g.left < w.right + 200 && g.right > w.left - 200);
  });
  expect(tied).toBe(true);

  // Esc puts the pen down: a tap on a word opens the dictionary again.
  await page.keyboard.press('Escape');
  await expect(page.getByRole('toolbar', { name: 'Write on the page' })).toHaveCount(0);
  await page.locator('.qr-chapter p .ar-word').nth(2).click();
  await expect(page.locator('.dict-popup')).toBeVisible({ timeout: 10000 });

  // Still there after a reload.
  await page.keyboard.press('Escape');
  await reopen(page);
  await expect(page.locator('.ink-clean .ink-stroke[d^="M"]')).toHaveCount(1, { timeout: 10000 });
});

test('Alt+K opens a sketch sheet: freehand, then a diagram node, kept for the passage', async ({ page }) => {
  await openSample(page);
  await page.keyboard.press('Alt+k');
  const panel = page.getByRole('complementary', { name: 'Sketch' });
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('Blank sheet');

  const sheet = (await panel.locator('.sk-surface').boundingBox())!;
  await scribble(page, sheet.x + 60, sheet.y + 80);
  await expect(panel.locator('.sk-ink path')).toHaveCount(1);

  await panel.getByRole('button', { name: 'Diagram' }).click();
  await panel.getByRole('button', { name: 'Add a node (N)' }).click();
  await page.keyboard.type('Group feeling');
  await page.keyboard.press('Enter');
  await expect(panel.locator('.sk-node')).toHaveText('Group feeling');
  await expect(panel).toContainText('Saved on this device');

  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
  await reopen(page);
  await page.keyboard.press('Alt+k');
  await expect(page.getByRole('complementary', { name: 'Sketch' }).locator('.sk-node')).toHaveText('Group feeling', { timeout: 10000 });
  await expect(page.getByRole('complementary', { name: 'Sketch' }).locator('.sk-ink path')).toHaveCount(1);
});

test('Write on a PDF page keeps the ink on the page at every zoom', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('.navbar__settings', { timeout: 15000 });
  await page.setInputFiles('.library__actions input[type=file]', { name: 'reading.pdf', mimeType: 'application/pdf', buffer: Buffer.from(sampleArabicBookPdf()) });
  const card = page.locator('.book-card', { hasText: 'كتاب القراءة' });
  await expect(card).toHaveCount(1, { timeout: 30000 });
  await card.locator('.book-card__open').click();
  await page.waitForSelector('.qr-chapter .ar-word', { timeout: 20000 });
  await page.locator('.qr-dock').getByRole('button', { name: 'Display', exact: true }).click();
  await page.getByRole('dialog', { name: 'Display' }).getByRole('button', { name: 'Original pages' }).click();
  await expect(page.locator('.reader__footer')).toContainText('Page 1 of 3', { timeout: 20000 });

  await page.getByRole('button', { name: 'Write', exact: true }).click();
  const frame = page.locator('.pdfp-page[data-page="1"]');
  const f = (await frame.boundingBox())!;
  await scribble(page, f.x + f.width * 0.3, f.y + f.height * 0.2, f.width * 0.3);
  const stroke = frame.locator('.ink-page .ink-stroke[d^="M"]');
  await expect(stroke).toHaveCount(1, { timeout: 5000 });

  // The stroke's place as a share of the page is the same after zooming in.
  const share = async () => {
    const [p, s] = [(await frame.boundingBox())!, (await stroke.boundingBox())!];
    return [(s.x - p.x) / p.width, (s.y - p.y) / p.height, s.width / p.width].map((n) => Math.round(n * 100) / 100);
  };
  const atFit = await share();
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await expect.poll(async () => (await frame.boundingBox())!.width, { timeout: 5000 }).toBeGreaterThan(f.width + 20);
  expect(await share()).toEqual(atFit);

  await page.getByRole('button', { name: 'Sketch', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Sketch' })).toContainText('Page 1');
});
