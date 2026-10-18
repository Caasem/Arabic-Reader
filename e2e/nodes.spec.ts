import { test, expect, type Page } from '@playwright/test';
import { sampleArabicBookPdf } from '../src/pdf/testPdf';
import { turnOnPdfConvert } from './pdfConvert';

/** Nodes (src/nodes): dots placed anywhere on a page, in the quiet reader and on PDF pages (Alt+O, Alt+Shift+O). */
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

/** The first dot's centre on screen. */
async function dotAt(page: Page) {
  const box = (await page.locator('.nx-dot[data-nx-top]').first().boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Alt+O, tap the page, name the node (its title opens for typing) and press Enter. */
async function placeNode(page: Page, x: number, y: number, title: string) {
  await page.keyboard.press('Alt+o');
  await expect(page.locator('.nx-hint')).toBeVisible();
  await page.mouse.click(x, y);
  await expect(page.locator('.nx-dot[data-nx-top]')).toHaveCount(1);
  await expect(page.locator('.nx-ttl:focus')).toBeVisible();
  await page.keyboard.type(title);
  await page.keyboard.press('Enter');
  await expect(page.locator('.nx-ttl').first()).toHaveText(title);
}

test('Alt+O places a node anywhere; it holds a note, collapses, and is still there after a reload', async ({ page }) => {
  await openSample(page);
  const stage = (await page.locator('.qr .qr-stage').boundingBox())!;
  const word = page.locator('.qr-chapter p .ar-word').first();
  const wordBox = (await word.boundingBox())!;

  // In the left margin, level with the first line: not on any word.
  await placeNode(page, stage.x + 40, wordBox.y + 4, 'The village');
  await expect(page.locator('.nx-hint')).toHaveCount(0);

  // Tap the dot: it opens (empty), and a note can be attached and typed.
  await page.locator('.nx-dot[data-nx-top]').click();
  await expect(page.locator('.nx-pn')).toBeVisible();
  await expect(page.locator('.nx-pn')).toContainText('Nothing attached yet');
  await page.locator('[data-nx-add="note"]').click();
  await expect(page.locator('.nx-tx.editing')).toBeFocused();
  await page.keyboard.type('Fatin loves reading');
  await page.keyboard.press('Enter');
  await expect(page.locator('.nx-row.nx-item .nx-tx')).toHaveText('Fatin loves reading');
  await expect(page.locator('.nx-pn .nx-ph em')).toHaveText('1');

  // Tap again: only the dot (and its title) is left; open it again and the note is back.
  await page.locator('.nx-dot[data-nx-top]').click();
  await expect(page.locator('.nx-pn')).toHaveCount(0);
  await expect(page.locator('.nx-ttl').first()).toHaveText('The village');
  await page.locator('.nx-dot[data-nx-top]').click();
  await expect(page.locator('.nx-row.nx-item .nx-tx')).toHaveText('Fatin loves reading');

  // It is tied to a word: after a reload it comes back in the same place.
  const before = await dotAt(page);
  await reopen(page);
  await expect(page.locator('.nx-dot[data-nx-top]')).toHaveCount(1, { timeout: 15000 });
  await expect(page.locator('.nx-ttl').first()).toHaveText('The village');
  const after = await dotAt(page);
  expect(Math.abs(after.x - before.x)).toBeLessThan(3);
  expect(Math.abs(after.y - before.y)).toBeLessThan(3);
});

test('a node moves with its text: it keeps its word when the window gets narrower', async ({ page }) => {
  await openSample(page);
  const stage = (await page.locator('.qr .qr-stage').boundingBox())!;
  const word = page.locator('.qr-chapter p .ar-word').first();
  const wordBox = (await word.boundingBox())!;
  await placeNode(page, stage.x + 40, wordBox.y + 4, 'Margin');

  /** The dot's distance from the first word (they move together when the text does). */
  const gap = async () => {
    const d = await dotAt(page);
    const w = (await word.boundingBox())!;
    return { dx: d.x - (w.x + w.width), dy: d.y - w.y };
  };
  const start = await gap();

  expect(Math.abs(start.dx)).toBeGreaterThan(5);

  // A narrower window reflows the text; the node keeps its word.
  await page.setViewportSize({ width: 1100, height: 900 });
  await expect.poll(async () => Math.abs((await gap()).dx - start.dx) < 40 && Math.abs((await gap()).dy - start.dy) < 40, { timeout: 8000 }).toBe(true);
});

test('drag a node onto another to nest it; Alt+Shift+O lists them and Carry keeps one with you', async ({ page }) => {
  await openSample(page);
  const stage = (await page.locator('.qr .qr-stage').boundingBox())!;
  const word = page.locator('.qr-chapter p .ar-word').first();
  const y = (await word.boundingBox())!.y;

  await placeNode(page, stage.x + 40, y + 4, 'First');
  // Collapse it so the second node does not land under its panel.
  await page.locator('.nx-dot[data-nx-top]').click();
  await page.keyboard.press('Alt+o');
  await page.mouse.click(stage.x + 40, y + 140);
  await expect(page.locator('.nx-dot[data-nx-top]')).toHaveCount(2);
  await page.keyboard.type('Second');
  await page.keyboard.press('Enter');

  // Drop the second dot on the first: one node is left, with one thing attached.
  const dots = page.locator('.nx-dot[data-nx-top]');
  const a = (await dots.nth(0).boundingBox())!;
  const b = (await dots.nth(1).boundingBox())!;
  const from = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  const to = { x: a.x + a.width / 2, y: a.y + a.height / 2 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 6 });
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await expect(page.locator('.nx-hint')).toContainText('Release to nest in');
  await page.mouse.up();
  await expect(page.locator('.nx-dot[data-nx-top]')).toHaveCount(1);
  await expect(page.locator('.nx-dot[data-nx-top]')).toHaveAttribute('aria-label', /1 attached/);

  // The list shows the one top-level node, and Bring here carries it.
  await page.keyboard.press('Alt+Shift+o');
  await expect(page.getByRole('dialog', { name: 'Nodes' })).toBeVisible();
  await expect(page.locator('.nx-list__row')).toHaveCount(1);
  await page.getByRole('button', { name: 'Bring here' }).click();
  await expect(page.locator('.nx-dot.is-carried')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Put away' })).toBeVisible();

  // A carried node stays where it is on screen when the page turns under it.
  const carried = await dotAt(page);
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(600);
  const later = await dotAt(page);
  expect(Math.abs(later.x - carried.x)).toBeLessThan(3);
  expect(Math.abs(later.y - carried.y)).toBeLessThan(3);
});

test('on PDF pages a node keeps its place on the page at any width, and carries to the next page', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('.navbar__settings', { timeout: 15000 });
  await turnOnPdfConvert(page);
  await page.setInputFiles('.library__actions input[type=file]', { name: 'reading.pdf', mimeType: 'application/pdf', buffer: Buffer.from(sampleArabicBookPdf()) });
  const card = page.locator('.book-card', { hasText: 'كتاب القراءة' });
  await expect(card).toHaveCount(1, { timeout: 30000 });
  await card.locator('.book-card__open').click();
  await page.waitForSelector('.qr-chapter .ar-word', { timeout: 20000 });
  await page.locator('.qr-dock').getByRole('button', { name: 'Display', exact: true }).click();
  await page.getByRole('dialog', { name: 'Display' }).getByRole('button', { name: 'Original pages' }).click();
  await expect(page.locator('.pdfp .qr-where--right')).toContainText('Page 1 of 3', { timeout: 20000 });
  await expect(page.locator('.pdfp-page canvas').first()).toBeVisible();

  const frame = async (n: number) => (await page.locator(`.pdfp-page[data-page="${n}"]`).boundingBox())!;
  const f1 = await frame(1);
  await placeNode(page, f1.x + f1.width * 0.3, f1.y + f1.height * 0.2, 'On the page');

  // As a share of the page, the dot does not move when the page gets narrower.
  const share = async () => {
    const d = await dotAt(page);
    const f = await frame(1);
    return { x: (d.x - f.x) / f.width, y: (d.y - f.y) / f.width };
  };
  const first = await share();
  expect(first.x).toBeGreaterThan(0.2);
  expect(first.x).toBeLessThan(0.4);
  await page.setViewportSize({ width: 1000, height: 900 });
  await expect.poll(async () => Math.abs((await share()).x - first.x) < 0.02 && Math.abs((await share()).y - first.y) < 0.02, { timeout: 8000 }).toBe(true);

  // Open it, carry it to the next page, and put it down there.
  await page.locator('.nx-dot[data-nx-top]').click();
  await page.locator('[data-nx-carry]').click();
  await expect(page.locator('.nx-dot.is-carried')).toHaveCount(1);
  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(page.locator('.pdfp .qr-where--right')).toContainText('Page 2 of 3');
  await expect(page.locator('.nx-dot.is-carried')).toBeVisible();
  await page.locator('[data-nx-putdown]').click();
  await expect(page.locator('.nx-dot.is-carried')).toHaveCount(0);
  await page.keyboard.press('Alt+Shift+o');
  await expect(page.locator('.nx-list__row')).toContainText('Page 2');
});

test('on PDF pages a node can sit in the margin beside the page, and is dragged back onto it', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('.navbar__settings', { timeout: 15000 });
  await turnOnPdfConvert(page);
  await page.setInputFiles('.library__actions input[type=file]', { name: 'reading.pdf', mimeType: 'application/pdf', buffer: Buffer.from(sampleArabicBookPdf()) });
  const card = page.locator('.book-card', { hasText: 'كتاب القراءة' });
  await expect(card).toHaveCount(1, { timeout: 30000 });
  await card.locator('.book-card__open').click();
  await page.waitForSelector('.qr-chapter .ar-word', { timeout: 20000 });
  await page.locator('.qr-dock').getByRole('button', { name: 'Display', exact: true }).click();
  await page.getByRole('dialog', { name: 'Display' }).getByRole('button', { name: 'Original pages' }).click();
  await expect(page.locator('.pdfp .qr-where--right')).toContainText('Page 1 of 3', { timeout: 20000 });
  await expect(page.locator('.pdfp-page canvas').first()).toBeVisible();

  const f = (await page.locator('.pdfp-page[data-page="1"]').boundingBox())!;
  // In the margin left of the page (the right one is the Ḥāshiya strip's), not on paper.
  await placeNode(page, f.x - 45, f.y + 180, 'Margin');
  const out = await dotAt(page);
  expect(out.x).toBeLessThan(f.x);

  // Drag it onto the page; it stays there after the window changes width.
  await page.mouse.move(out.x, out.y);
  await page.mouse.down();
  await page.mouse.move(f.x + f.width * 0.5, f.y + 300, { steps: 10 });
  await page.mouse.up();
  await expect.poll(async () => (await dotAt(page)).x, { timeout: 5000 }).toBeGreaterThan(f.x);
  const share = async () => {
    const d = await dotAt(page);
    const fr = (await page.locator('.pdfp-page[data-page="1"]').boundingBox())!;
    return (d.x - fr.x) / fr.width;
  };
  const before = await share();
  await page.setViewportSize({ width: 1000, height: 900 });
  await expect.poll(async () => Math.abs((await share()) - before) < 0.02, { timeout: 8000 }).toBe(true);
});
