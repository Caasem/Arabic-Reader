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
  await expect(page.locator('.ink-clean--on')).toBeVisible();
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
  await expect(page.locator('.pdfp .qr-where--right')).toContainText('Page 1 of 3', { timeout: 20000 });

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
  await page.locator('.qr-dock').getByRole('button', { name: 'Display', exact: true }).click();
  await page.getByRole('dialog', { name: 'Display' }).getByRole('button', { name: 'Zoom in' }).click();
  await page.locator('.qr-dock').getByRole('button', { name: 'Display', exact: true }).click();
  await expect.poll(async () => (await frame.boundingBox())!.width, { timeout: 5000 }).toBeGreaterThan(f.width + 20);
  expect(await share()).toEqual(atFit);

  await page.getByRole('button', { name: 'Sketch', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Sketch' })).toContainText('Page 1');
});

test('a sketch goes to the margin as a picture card that opens its sheet again', async ({ page }) => {
  await openSample(page);
  await page.keyboard.press('Alt+k');
  const panel = page.getByRole('complementary', { name: 'Sketch' });
  await panel.getByRole('button', { name: 'Diagram' }).click();
  await panel.getByRole('button', { name: 'Add a node (N)' }).click();
  await page.keyboard.type('Group feeling');
  await page.keyboard.press('Enter');
  await expect(panel).toContainText('Saved on this device');

  await panel.getByRole('button', { name: /To margin/ }).click();
  await panel.getByRole('menuitem', { name: /as a picture/ }).click();
  await expect(panel.locator('.sk-foot [role=status]')).toContainText('Sketch sent to the margin');
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);

  const card = page.locator('.sd-gloss', { hasText: 'Sketch' }).first();
  await expect(card).toBeVisible({ timeout: 10000 });
  // The picture is the sheet as an SVG, so it stays sharp at any size (Word export makes a PNG of it).
  await expect.poll(() => card.locator('img').evaluate(async (img: HTMLImageElement) => (await (await fetch(img.src)).blob()).type)).toBe('image/svg+xml');
  await card.hover();
  await card.getByRole('button', { name: 'Open sketch' }).click();
  await expect(page.getByRole('complementary', { name: 'Sketch' }).locator('.sk-node')).toHaveText('Group feeling');
});

test('writing in a margin makes an ink card: strokes close together join it, Undo takes one back, and it folds', async ({ page }) => {
  await openSample(page);
  const area = page.locator('.sd-margins__area').last();
  await expect(area).toBeVisible();
  const a = (await area.boundingBox())!;
  const lineY = await page.evaluate(() => {
    const r = document.querySelector('.qr-chapter p .ar-word')!.getBoundingClientRect();
    return r.top + r.height / 2;
  });
  await page.keyboard.press('Alt+w');
  await expect(page.locator('body.ink-writing')).toHaveCount(1);
  await scribble(page, a.x + 30, lineY, 120);
  const card = page.locator('.sd-gloss', { has: page.locator('.sd-mink') });
  await expect(card).toHaveCount(1);
  await expect(card.locator('.sd-mink path')).toHaveCount(1);
  await expect(card).toContainText('Ink');
  // A second stroke just under the first joins the same card.
  await scribble(page, a.x + 30, lineY + 14, 100);
  await expect(card.locator('.sd-mink path')).toHaveCount(2);
  // Undo takes it back.
  await page.keyboard.press('Control+z');
  await expect(card.locator('.sd-mink path')).toHaveCount(1);

  // The text column still takes page ink, not a card.
  const col = (await page.locator('.qr-column').boundingBox())!;
  await scribble(page, col.x + col.width / 2 - 60, lineY + 40, 80);
  await expect(page.locator('.ink-clean path.ink-stroke:not(:last-child), .ink-clean g:not(:last-child) path')).not.toHaveCount(0);
  await expect(page.locator('.sd-gloss', { has: page.locator('.sd-mink') })).toHaveCount(1);

  // After a pause, a stroke further down starts a second card.
  await page.waitForTimeout(2700);
  await scribble(page, a.x + 30, lineY + 160, 100);
  await expect(page.locator('.sd-gloss', { has: page.locator('.sd-mink') })).toHaveCount(2);

  // Done: the ink cards fold like any card, showing a picture of the handwriting.
  await page.keyboard.press('Escape');
  await page.mouse.click(5, 300);
  await page.keyboard.press('[');
  await expect(page.locator('.sd-gloss--chip .sd-chip__thumb')).toHaveCount(2);
  await page.keyboard.press(']');
  await expect(page.locator('.sd-mink')).toHaveCount(2);
});

test('writing in the strip beside PDF pages makes an ink card there', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('.navbar__settings', { timeout: 15000 });
  await page.setInputFiles('.library__actions input[type=file]', { name: 'book.pdf', mimeType: 'application/pdf', buffer: Buffer.from(sampleArabicBookPdf()) });
  await expect(page.locator('.book-card')).toHaveCount(1, { timeout: 30000 });
  await page.locator('.book-card__open').first().click();
  const strip = page.locator('.sd-pdfmargin__area');
  await expect(strip).toBeVisible({ timeout: 20000 });
  await page.keyboard.press('Alt+w');
  const s = (await strip.boundingBox())!;
  await scribble(page, s.x + 40, s.y + 200, 140);
  await expect(page.locator('.sd-pdfmargin .sd-gloss .sd-mink path')).toHaveCount(1);
  // It is a desk item: the document lists it with a picture of the ink.
  await page.keyboard.press('Escape');
  await expect(page.locator('.sd-pdfmargin .sd-gloss')).toContainText('Ink');
});

test('sheets are tabs: + adds one, a name sticks, ✕ closes to All sheets, Ctrl+Tab switches, the dock counts them', async ({ page }) => {
  await openSample(page);
  await page.keyboard.press('Alt+k');
  const panel = page.getByRole('complementary', { name: 'Sketch' });
  const tabs = panel.getByRole('tab');
  const draw = async (dy = 0) => {
    const sheet = (await panel.locator('.sk-surface').boundingBox())!;
    await scribble(page, sheet.x + 60, sheet.y + 80 + dy);
  };
  await draw();
  await expect(tabs).toHaveCount(1);
  await expect(tabs.first()).toHaveText('Sheet 1');

  // + opens a second sheet; it is kept once something is on it.
  await panel.getByRole('button', { name: /^New sheet/ }).click();
  await expect(tabs).toHaveCount(2);
  await expect(panel.locator('.sk-ink path')).toHaveCount(0);
  await draw(40);
  await draw(80);
  await expect(panel.locator('.sk-ink path')).toHaveCount(2);
  await expect(panel).toContainText('Saved on this device');

  // Double-click renames.
  await tabs.nth(1).dblclick();
  await panel.getByRole('textbox', { name: 'Sheet name' }).fill('Grammar');
  await page.keyboard.press('Enter');
  await expect(tabs.nth(1)).toHaveText('Grammar');

  // Ctrl+Tab goes to the other sheet.
  await panel.locator('.sk-surface').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Control+Tab');
  await expect(tabs.nth(0)).toHaveAttribute('aria-selected', 'true');
  await expect(panel.locator('.sk-ink path')).toHaveCount(1);

  // The dock's Sketch button counts the sheets here.
  await expect(page.locator('.qr-dock').getByRole('button', { name: /Sketch/ })).toContainText('2');

  // ✕ closes a sheet: no longer a tab, still in All sheets, from where it opens again.
  await panel.getByRole('button', { name: 'Close Grammar' }).click();
  await expect(tabs).toHaveCount(1);
  await panel.getByRole('button', { name: 'All sheets' }).click();
  const list = panel.getByRole('dialog', { name: 'All sheets' });
  await expect(list.locator('.sk-list__item')).toHaveCount(2);
  await expect(list).toContainText('closed');
  // The list searches names and the words on the sheets.
  await list.getByRole('searchbox', { name: 'Search the sheets' }).fill('gram');
  await expect(list.locator('.sk-list__item')).toHaveCount(1);
  await list.getByRole('searchbox', { name: 'Search the sheets' }).fill('');
  await list.locator('.sk-list__item', { hasText: 'Grammar' }).click();
  await expect(tabs).toHaveCount(2);
  await expect(panel.getByRole('tab', { name: 'Grammar' })).toHaveAttribute('aria-selected', 'true');

  // The whole book: the sheet is a tab in every chapter.
  await panel.getByRole('button', { name: 'More for Grammar' }).click();
  await panel.getByRole('menuitemradio', { name: 'The whole book' }).click();
  await expect(panel.getByRole('tab', { name: /Grammar/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.locator('.qr-dock').getByRole('button', { name: /Contents/ }).click();
  await page.locator('.qr-drawer, [role=dialog]').getByText(/الفصل الثالث/).first().click();
  await page.keyboard.press('Alt+k');
  await expect(page.getByRole('complementary', { name: 'Sketch' }).getByRole('tab', { name: /Grammar/ })).toBeVisible();
});

test('an ink card opens as a sheet, and a sheet\'s handwriting goes to the margin as an ink card', async ({ page }) => {
  await openSample(page);
  const area = page.locator('.sd-margins__area').last();
  const a = (await area.boundingBox())!;
  const lineY = await page.evaluate(() => {
    const r = document.querySelector('.qr-chapter p .ar-word')!.getBoundingClientRect();
    return r.top + r.height / 2;
  });
  await page.keyboard.press('Alt+w');
  await expect(page.locator('body.ink-writing')).toHaveCount(1);
  await scribble(page, a.x + 30, lineY, 120);
  await page.keyboard.press('Escape');
  const card = page.locator('.sd-gloss', { has: page.locator('.sd-mink') });
  await expect(card).toHaveCount(1);
  // A card's buttons show while it has the focus.
  await card.getByRole('textbox').click();
  await card.getByRole('button', { name: 'Open as sheet' }).click();
  const panel = page.getByRole('complementary', { name: 'Sketch' });
  await expect(panel.getByRole('tab', { name: 'Margin ink' })).toHaveAttribute('aria-selected', 'true');
  await expect(panel.locator('.sk-ink path')).toHaveCount(1);

  // And back: the sheet's handwriting as a second ink card, named after the sheet.
  await panel.getByRole('button', { name: /To margin/ }).click();
  await panel.getByRole('menuitem', { name: /as an ink card/ }).click();
  await expect(panel.locator('.sk-foot [role=status]')).toContainText('Ink card in the margin');
  // The margins have room again once the panel is closed.
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
  await expect(page.locator('.sd-gloss', { has: page.locator('.sd-mink') })).toHaveCount(2);
  await expect(page.locator('.sd-gloss', { hasText: 'Ink from sketch · Margin ink' })).toHaveCount(1);
});

test('a quote from the reader goes back to its words, and its words open the dictionary', async ({ page }) => {
  await openSample(page);
  await page.keyboard.press('Alt+k');
  const panel = page.getByRole('complementary', { name: 'Sketch' });
  await panel.getByRole('button', { name: 'Diagram' }).click();
  // With nothing selected, Quote says what to do.
  await panel.getByRole('button', { name: 'Add the selected text as a quote' }).click();
  await expect(panel.locator('.sk-foot [role=status]')).toContainText('Select words on the page first');
  await page.evaluate(() => {
    const words = document.querySelectorAll('.qr-chapter p .ar-word');
    const range = document.createRange();
    range.setStartBefore(words[0]);
    range.setEndAfter(words[2]);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
  });
  await panel.getByRole('button', { name: 'Add the selected text as a quote' }).click();
  const quote = panel.locator('.sk-node--quote');
  await expect(quote).toHaveCount(1);
  await quote.getByRole('button', { name: 'Go to it on the page' }).click();
  await expect(page.locator('.sk-flash')).not.toHaveCount(0);
  // Selected (a new quote is), a click on one of its words looks it up.
  await quote.locator('.sk-w').first().click();
  await expect(page.locator('.dpage')).toBeVisible();
});


test('diagram: a template, tinted boxes, Shift to select more, and Tidy lays it out', async ({ page }) => {
  await openSample(page);
  await page.keyboard.press('Alt+k');
  const panel = page.getByRole('complementary', { name: 'Sketch' });
  await panel.getByRole('button', { name: 'Diagram' }).click();
  await panel.getByRole('button', { name: 'Templates ▾' }).click();
  await panel.getByRole('menuitem', { name: /Root family/ }).click();
  const nodes = panel.locator('.sk-node');
  await expect(nodes).toHaveCount(6);
  await expect(panel.locator('.sk-edge')).toHaveCount(5);

  // The first node is selected: tint it.
  const colours = panel.getByRole('toolbar', { name: 'Box colour' });
  await colours.getByRole('button', { name: 'Colour: Yellow' }).click();
  await expect(nodes.first()).toHaveClass(/sk-node--tinted/);
  // Shift-click a second box: both take the next colour.
  await nodes.nth(1).click({ modifiers: ['Shift'] });
  await expect(colours).toContainText('2 boxes');
  await colours.getByRole('button', { name: 'Colour: Blue' }).click();
  await expect(panel.locator('.sk-node--tinted')).toHaveCount(2);

  // Tidy: the root on top, the five words made from it side by side in the row below.
  await panel.getByRole('button', { name: 'Tidy the diagram' }).click();
  const tops = await nodes.evaluateAll((els) => els.map((el) => Math.round(parseFloat((el as HTMLElement).style.top))));
  expect(new Set(tops.slice(1)).size).toBe(1);
  expect(tops[0]).toBeLessThan(tops[1]);

  // Shift-drag on the sheet selects every box it touches.
  const stage = (await panel.locator('.sk-surface').boundingBox())!;
  await page.keyboard.down('Shift');
  await page.mouse.move(stage.x + 4, stage.y + 4);
  await page.mouse.down();
  await page.mouse.move(stage.x + stage.width - 4, stage.y + stage.height - 40, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.up('Shift');
  await expect(colours).toContainText('6 boxes');
});

test('freehand: the marker, and the lasso moves and deletes strokes', async ({ page }) => {
  await openSample(page);
  await page.keyboard.press('Alt+k');
  const panel = page.getByRole('complementary', { name: 'Sketch' });
  const sheet = (await panel.locator('.sk-surface').boundingBox())!;
  await scribble(page, sheet.x + 40, sheet.y + 80, 100);
  await scribble(page, sheet.x + 40, sheet.y + 260, 100);
  await panel.getByRole('button', { name: 'Marker (M)' }).click();
  await scribble(page, sheet.x + 40, sheet.y + 170, 100);
  await expect(panel.locator('.sk-ink path.ink-stroke--marker')).toHaveCount(1);

  // A loop round the first stroke holds it; dragging inside the box moves it; Delete removes it.
  await panel.getByRole('button', { name: /^Lasso/ }).click();
  const loop = [[20, 50], [170, 50], [170, 115], [20, 115], [20, 52]];
  await page.mouse.move(sheet.x + loop[0][0], sheet.y + loop[0][1]);
  await page.mouse.down();
  for (const [x, y] of loop.slice(1)) await page.mouse.move(sheet.x + x, sheet.y + y, { steps: 4 });
  await page.mouse.up();
  await expect(panel.locator('.sk-ink path.sk-held')).toHaveCount(1);
  const before = await panel.locator('.sk-ink path.sk-held').getAttribute('d');
  await page.mouse.move(sheet.x + 90, sheet.y + 80);
  await page.mouse.down();
  await page.mouse.move(sheet.x + 140, sheet.y + 110, { steps: 5 });
  await page.mouse.up();
  expect(await panel.locator('.sk-ink path.sk-held').getAttribute('d')).not.toBe(before);
  await page.keyboard.press('Delete');
  await expect(panel.locator('.sk-ink path.ink-stroke')).toHaveCount(2);
  // Undo brings it back.
  await page.keyboard.press('Control+z');
  await expect(panel.locator('.sk-ink path.ink-stroke')).toHaveCount(3);
});

test('a node sent to the margin follows its sheet, until the note is edited: then it offers Refresh', async ({ page }) => {
  await openSample(page);
  await page.keyboard.press('Alt+k');
  let panel = page.getByRole('complementary', { name: 'Sketch' });
  await panel.getByRole('button', { name: 'Diagram' }).click();
  await panel.getByRole('button', { name: 'Add a node (N)' }).click();
  await page.keyboard.type('Group feeling');
  await page.keyboard.press('Enter');
  await panel.locator('.sk-node').click();
  await panel.getByRole('button', { name: /To margin/ }).click();
  await panel.getByRole('menuitem', { name: /Selected node only/ }).click();
  await expect(panel.locator('.sk-foot [role=status]')).toContainText('Node sent to the margin');

  const renameNode = async (text: string) => {
    await page.keyboard.press('Alt+k');
    panel = page.getByRole('complementary', { name: 'Sketch' });
    await panel.locator('.sk-node').click();
    await page.keyboard.press('Enter');
    await page.keyboard.type(text);
    await page.keyboard.press('Enter');
    await expect(panel).toContainText('Saved on this device');
    await page.keyboard.press('Escape');
    await expect(panel).toHaveCount(0);
  };
  await page.keyboard.press('Escape');
  const card = page.locator('.sd-gloss', { hasText: 'From sketch' });
  await expect(card.getByRole('textbox')).toHaveValue('Group feeling');

  // The sheet changes: the untouched note follows.
  await renameNode('Asabiyya');
  await expect(card.getByRole('textbox')).toHaveValue('Asabiyya');

  // Edited by hand, it is not overwritten: it says the sheet changed, and Refresh takes the new words.
  await card.getByRole('textbox').click();
  await page.keyboard.press('End');
  await page.keyboard.type(' (my note)');
  await page.keyboard.press('Escape');
  await renameNode('Group cohesion');
  await expect(card.getByRole('textbox')).toHaveValue('Asabiyya (my note)');
  await card.getByRole('button', { name: 'Sheet changed · Refresh' }).click();
  await expect(card.getByRole('textbox')).toHaveValue('Group cohesion');
});

test('ink on a PDF page stays readable on Night pages', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('.navbar__settings', { timeout: 15000 });
  await page.setInputFiles('.library__actions input[type=file]', { name: 'reading.pdf', mimeType: 'application/pdf', buffer: Buffer.from(sampleArabicBookPdf()) });
  await page.locator('.book-card__open').first().click();
  await expect(page.locator('.pdfp .qr-where--right')).toContainText('Page 1 of 3', { timeout: 20000 });
  await page.getByRole('button', { name: 'Write', exact: true }).click();
  const f = (await page.locator('.pdfp-page[data-page="1"]').boundingBox())!;
  await scribble(page, f.x + f.width * 0.3, f.y + f.height * 0.5, f.width * 0.3);
  await expect(page.locator('.pdfp-page[data-page="1"] .ink-page path.ink-stroke')).not.toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.locator('.qr-dock').getByRole('button', { name: 'Display', exact: true }).click();
  await page.getByRole('dialog', { name: 'Display' }).getByRole('group', { name: 'Pages' }).getByRole('button', { name: 'Night' }).click();
  await page.keyboard.press('Escape');
  // Turned like the page: dark ink shows light on the dark paper.
  await expect.poll(() => page.locator('.pdfp-page[data-page="1"] .ink-page').evaluate((el) => getComputedStyle(el).filter)).toContain('invert');
});
