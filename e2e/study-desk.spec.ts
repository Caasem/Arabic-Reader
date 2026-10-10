import { test, expect, type Page } from '@playwright/test';
import { makePdf } from '../src/pdf/testPdf';

/**
 * The study desk (src/studyDesk): Alt+C concept, Alt+X region capture, the Alt+I inbox and the desk document.
 */
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

/** The height of a paragraph's first line (the sample chapter is short: tap beside text, not empty page). */
async function lineY(page: Page, paragraph: number) {
  return page.evaluate((n) => {
    const ps = Array.from(document.querySelectorAll('.qr-chapter p')).filter((p) => p.querySelector('.ar-word'));
    const r = ps[Math.min(n, ps.length - 1)].querySelector('.ar-word')!.getBoundingClientRect();
    return r.top + r.height / 2;
  }, paragraph);
}

/** A box around the first line of the first paragraph, in page coordinates. */
async function firstLineBox(page: Page) {
  return page.evaluate(() => {
    const words = Array.from(document.querySelectorAll('.qr-chapter p .ar-word')).slice(0, 4);
    const rs = words.map((w) => w.getBoundingClientRect());
    return { left: Math.min(...rs.map((r) => r.left)) - 4, right: Math.max(...rs.map((r) => r.right)) + 4, top: Math.min(...rs.map((r) => r.top)) - 4, bottom: Math.max(...rs.map((r) => r.bottom)) + 4 };
  });
}

test('Alt+C adds a concept to the inbox; the inbox writes concepts too', async ({ page }) => {
  await openSample(page);
  await page.keyboard.press('Alt+c');
  const strip = page.getByRole('dialog', { name: 'Write a concept' });
  await expect(strip).toBeVisible();
  await strip.getByRole('textbox', { name: 'Concept' }).fill('Group feeling');
  await page.keyboard.press('Enter');
  await expect(strip).toHaveCount(0);

  await page.keyboard.press('Alt+i');
  const inbox = page.getByRole('dialog', { name: 'Inbox' }).or(page.getByRole('complementary', { name: 'Inbox' }));
  await expect(inbox.locator('.dsearch__entry')).toHaveCount(1);
  await expect(inbox.locator('.dsearch__entry').first()).toContainText('Group feeling');

  const input = inbox.getByRole('textbox', { name: 'Search the inbox, or write a concept' });
  await input.fill('Acquisition');
  await expect(inbox.locator('.dsearch__entry').first()).toContainText('New concept');
  await page.keyboard.press('Enter');
  await expect(inbox.locator('.dsearch__entry')).toHaveCount(2);
  await page.keyboard.press('Escape');
  await expect(inbox).toHaveCount(0);
});

test('Alt+X captures the words in a dragged box and highlights them', async ({ page }) => {
  await openSample(page);
  const box = await firstLineBox(page);
  await page.keyboard.press('Alt+x');
  await expect(page.locator('.sd-region')).toBeVisible();
  await page.mouse.move(box.right, box.top);
  await page.mouse.down();
  await page.mouse.move((box.left + box.right) / 2, (box.top + box.bottom) / 2, { steps: 4 });
  await page.mouse.move(box.left, box.bottom, { steps: 4 });
  await page.mouse.up();
  const bar = page.getByRole('dialog', { name: 'Capture' });
  await expect(bar).toBeVisible();
  await expect(bar.locator('.sd-capbar__thumb')).not.toBeEmpty();
  await bar.getByRole('button', { name: /^Send to/ }).click();
  await expect(bar).toHaveCount(0);

  // A highlight was made, listed under Marks.
  await page.locator('.qr-dock').getByRole('button', { name: 'Marks', exact: true }).click();
  await expect(page.locator('.qr-drawer .qr-hl-card')).toHaveCount(1);

  await page.keyboard.press('Alt+i');
  await expect(page.locator('.dsearch__entry .dsearch__provider', { hasText: 'Quote' })).toHaveCount(1);
});

test('the desk document embeds captures, makes headings and reorders from the side panel', async ({ page }) => {
  await openSample(page);
  for (const text of ['First concept', 'Second concept']) {
    await page.keyboard.press('Alt+c');
    await page.getByRole('textbox', { name: 'Concept' }).fill(text);
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: 'Write a concept' })).toHaveCount(0);
  }
  await page.keyboard.press('Alt+i');
  await page.getByRole('button', { name: 'Open the desk document' }).click();

  const doc = page.getByRole('dialog', { name: 'Desk document' });
  await expect(doc).toBeVisible();
  const editor = doc.getByRole('textbox', { name: 'Document text' });
  await expect(editor.locator('.desk-embed')).toHaveCount(2);
  await expect(editor.locator('.desk-embed').first()).toContainText('First concept');

  // Typing at the end: "# " makes a heading.
  await editor.locator('p').last().click();
  await page.keyboard.type('# Notes');
  await expect(editor.locator('h3')).toHaveText('Notes');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Plain text after the heading');
  await expect(editor).toContainText('Plain text after the heading');

  // The side panel moves the second item up.
  const order = doc.locator('.sd-order__i');
  await expect(order).toHaveCount(2);
  await order.nth(1).getByRole('button', { name: 'Move up' }).click();
  await expect(editor.locator('.desk-embed').first()).toContainText('Second concept');

  // It is saved: closing and opening again keeps the order and the text.
  await doc.getByRole('button', { name: 'Back to the page' }).click();
  await expect(doc).toHaveCount(0);
  await page.keyboard.press('Alt+i');
  await page.getByRole('button', { name: 'Open the desk document' }).click();
  await expect(editor.locator('.desk-embed').first()).toContainText('Second concept');
  await expect(editor.locator('h3')).toHaveText('Notes');
});

test.describe('margins', () => {
  test('captures sit in the margin; double-tap writes a note that reaches the document', async ({ page }) => {
    await openSample(page);
    await page.keyboard.press('Alt+c');
    await page.getByRole('textbox', { name: 'Concept' }).fill('Margin concept');
    await page.keyboard.press('Enter');
    const glosses = page.locator('.sd-gloss');
    await expect(glosses).toHaveCount(1);
    await expect(glosses.first()).toContainText('Margin concept');

    const area = page.locator('.sd-margins__area').last();
    const box = (await area.boundingBox())!;
    await page.mouse.dblclick(box.x + box.width / 2, await lineY(page, 2));
    const note = page.getByRole('textbox', { name: 'Margin note' });
    await expect(note).toBeFocused();
    await page.keyboard.type('Why does he go home?');
    await expect(page.locator('.sd-gloss--m .sd-sug', { hasText: 'Question' })).toBeVisible();
    await page.locator('.sd-gloss--m').getByRole('button', { name: 'Question', exact: true }).click();
    await expect(page.locator('.sd-gloss--question')).toHaveCount(1);
    await page.locator('.sd-gloss--m').getByRole('button', { name: 'Show in document' }).click();
    const doc = page.getByRole('dialog', { name: 'Desk document' });
    await expect(doc.locator('.desk-embed', { hasText: 'Why does he go home?' })).toHaveCount(1);
  });

  test('cards fold to one line and open again: the ▾, a click, [ and ], and the Cards setting', async ({ page }) => {
    await openSample(page);
    const area = page.locator('.sd-margins__area').last();
    const box = (await area.boundingBox())!;
    await page.mouse.dblclick(box.x + box.width / 2, await lineY(page, 1));
    await expect(page.getByRole('textbox', { name: 'Margin note' })).toBeFocused();
    await page.keyboard.type('A note to fold away');
    await page.keyboard.press('Escape');
    const card = page.locator('.sd-gloss--m');
    await expect(card).toHaveCount(1);

    // The ▾ folds it to a chip with its first words; pointing at the chip shows the whole card.
    await card.hover();
    await card.getByRole('button', { name: 'Fold this card' }).click();
    const chip = page.getByRole('button', { name: /^Open the card: Note, A note to fold away/ });
    await expect(chip).toBeVisible();
    await page.mouse.move(5, 5);
    await chip.hover();
    await expect(page.locator('.sd-chip__peek')).toContainText('A note to fold away');
    // A click opens it again.
    await chip.click();
    await expect(page.getByRole('textbox', { name: 'Margin note' })).toHaveValue('A note to fold away');

    // [ folds every card on screen, ] opens them.
    await page.mouse.move(5, 5);
    await page.mouse.click(5, 300);
    await page.keyboard.press('[');
    await expect(page.locator('.sd-gloss--chip')).toHaveCount(1);
    await page.keyboard.press(']');
    await expect(page.locator('.sd-gloss--chip')).toHaveCount(0);

    // Margin settings → Cards: Folded folds cards that have no choice of their own; a new note opens to be written.
    await page.getByRole('button', { name: 'Margin settings' }).click();
    await page.getByRole('group', { name: 'Cards' }).getByRole('button', { name: 'Folded' }).click();
    await page.keyboard.press('Escape');
    await page.mouse.dblclick(box.x + box.width / 2, await lineY(page, 3));
    await expect(page.locator('.sd-gloss__body:focus')).toHaveCount(1);
    await page.keyboard.type('Second');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: /^Open the card: Note, Second/ })).toBeVisible();
    // The first card was opened by hand (]), so it stays open.
    await expect(page.locator('.sd-gloss--m:not(.sd-gloss--chip)')).toHaveCount(1);
  });

  test('a margin note becomes a flashcard in review; Alt+M hides the margins', async ({ page }) => {
    await openSample(page);
    const area = page.locator('.sd-margins__area').last();
    await expect(area).toBeVisible();
    const box = (await area.boundingBox())!;
    await page.mouse.dblclick(box.x + box.width / 2, await lineY(page, 1));
    await expect(page.getByRole('textbox', { name: 'Margin note' })).toBeFocused();
    await page.keyboard.type('عصبية = group feeling');
    await page.locator('.sd-gloss--m').getByRole('button', { name: 'Flashcard', exact: true }).click();
    await expect(page.locator('.sd-gloss--card .sd-gloss__front')).toContainText('عصبية');
    await expect(page.locator('.sd-toast')).toContainText('Added to review');

    await page.keyboard.press('Escape');
    await page.keyboard.press('Alt+m');
    await expect(page.locator('.sd-margins')).toHaveCount(0);
    await page.keyboard.press('Alt+m');
    await expect(page.locator('.sd-gloss--card')).toHaveCount(1);
  });

  test('a double-tap far below the last line makes no note', async ({ page }) => {
    await openSample(page);
    const area = page.locator('.sd-margins__area').last();
    const box = (await area.boundingBox())!;
    const last = await lineY(page, 99);
    test.skip(last + 120 > box.y + box.height - 20, 'the chapter fills the page here');
    await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height - 20);
    await expect(page.locator('.sd-toast')).toContainText('Tap beside a line of text');
    await expect(page.locator('.sd-gloss--m')).toHaveCount(0);
  });

  test('an empty note disappears when left', async ({ page }) => {
    await openSample(page);
    const area = page.locator('.sd-margins__area').last();
    const box = (await area.boundingBox())!;
    await page.mouse.dblclick(box.x + box.width / 2, await lineY(page, 2));
    await expect(page.getByRole('textbox', { name: 'Margin note' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('.sd-gloss--m')).toHaveCount(0);
  });
});

test.describe('pull in', () => {
  // A 2x2 PNG.
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR42mP8z8Dwn4GBgYGJAQoAADUBAf8Ik8gAAAAASUVORK5CYII=', 'base64');

  async function captureFirstLine(page: Page) {
    const box = await firstLineBox(page);
    await page.keyboard.press('Alt+x');
    await page.mouse.move(box.right, box.top);
    await page.mouse.down();
    await page.mouse.move(box.left, box.bottom, { steps: 6 });
    await page.mouse.up();
    const bar = page.getByRole('dialog', { name: 'Capture' });
    await bar.getByRole('button', { name: /^Send to/ }).click();
    await expect(bar).toHaveCount(0);
  }

  test('Alt+U pulls a saved highlight into the margin, and the inbox button pulls into the inbox', async ({ page }) => {
    await openSample(page);
    await captureFirstLine(page);
    await expect(page.locator('.sd-gloss')).toHaveCount(1);

    await page.keyboard.press('Alt+u');
    const pull = page.getByRole('dialog', { name: 'Pull in' }).or(page.getByRole('complementary', { name: 'Pull in' }));
    await expect(pull).toBeVisible();
    await pull.getByRole('button', { name: 'Highlights' }).click();
    await expect(pull.locator('.dsearch__entry .dsearch__provider', { hasText: 'Highlight' })).toHaveCount(1);
    await expect(pull.getByRole('button', { name: 'Right margin' })).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Enter');
    await expect(pull).toHaveCount(0);
    await expect(page.locator('.sd-toast')).toContainText('right margin');
    await expect(page.locator('.sd-gloss')).toHaveCount(2);

    await page.keyboard.press('Alt+i');
    const inbox = page.getByRole('dialog', { name: 'Inbox' }).or(page.getByRole('complementary', { name: 'Inbox' }));
    await expect(inbox.locator('.dsearch__entry')).toHaveCount(1);
    await inbox.getByRole('button', { name: /^Pull in/ }).click();
    await pull.getByRole('button', { name: 'Inbox', exact: true }).click();
    await pull.getByRole('button', { name: 'Highlights' }).click();
    await page.keyboard.press('Enter');
    await expect(page.locator('.sd-toast')).toContainText('inbox');
    await page.keyboard.press('Alt+i');
    await expect(inbox.locator('.dsearch__entry')).toHaveCount(2);
  });

  test('an image file pulled in sits in a frame in the margin', async ({ page }) => {
    await openSample(page);
    await page.keyboard.press('Alt+u');
    await page.getByLabel('Image file').setInputFiles({ name: 'figure.png', mimeType: 'image/png', buffer: png });
    await expect(page.locator('.sd-gloss .sd-frame img')).toHaveCount(1);
  });
});

test.describe('margin images', () => {
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR42mP8z8Dwn4GBgYGJAQoAADUBAf8Ik8gAAAAASUVORK5CYII=';

  test('an image pasted into a margin note turns it into a screenshot', async ({ page }) => {
    await openSample(page);
    const area = page.locator('.sd-margins__area').last();
    const box = (await area.boundingBox())!;
    await page.mouse.dblclick(box.x + box.width / 2, await lineY(page, 1));
    const note = page.getByRole('textbox', { name: 'Margin note' });
    await expect(note).toBeFocused();
    await page.keyboard.type('Figure');
    await note.evaluate((el, b64) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const dt = new DataTransfer();
      dt.items.add(new File([bytes], 'shot.png', { type: 'image/png' }));
      el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    }, png);
    await expect(page.locator('.sd-gloss--capture .sd-frame img')).toHaveCount(1);
    await expect(note).toHaveValue('Figure');
  });

  test('an image file dropped on a margin becomes a note at that height', async ({ page }) => {
    await openSample(page);
    const area = page.locator('.sd-margins__area').last();
    await expect(area).toBeVisible();
    const y = await lineY(page, 2);
    await area.evaluate((el, [b64, y]) => {
      const r = el.getBoundingClientRect();
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const dt = new DataTransfer();
      dt.items.add(new File([bytes], 'figure.png', { type: 'image/png' }));
      const at = { clientX: r.left + r.width / 2, clientY: y as number, dataTransfer: dt, bubbles: true, cancelable: true };
      el.dispatchEvent(new DragEvent('dragover', at));
      el.dispatchEvent(new DragEvent('drop', at));
    }, [png, y] as const);
    await expect(page.locator('.sd-gloss--m .sd-frame img')).toHaveCount(1);
    await expect(page.locator('.sd-toast')).toContainText('Image placed');
  });
});

async function openScan(page: Page) {
  await page.goto('/');
  await page.waitForSelector('.navbar__settings', { timeout: 15000 });
  await page.setInputFiles('.library__actions input[type=file]', { name: 'scan.pdf', mimeType: 'application/pdf', buffer: Buffer.from(makePdf([{ image: true }, { image: true }])) });
  await expect(page.locator('.book-card')).toHaveCount(1, { timeout: 30000 });
  await page.locator('.book-card__open').first().click();
  await expect(page.locator('.pdfp .qr-where--right')).toContainText('Page 1 of 2', { timeout: 20000 });
  // The margin beside the pages is there from the start; the pages fit beside it.
  await expect(page.locator('.sd-pdfmargin__area')).toBeVisible();
  // Page 1 drawn at its new width.
  await expect.poll(() => page.evaluate(() => (document.querySelector('.pdfp-page[data-page="1"] canvas') as HTMLCanvasElement | null)?.width ?? 0)).toBeGreaterThan(0);
}

test('a region captured on a scanned PDF page is boxed on the page with a card beside it', async ({ page }) => {
  await openScan(page);
  const frame = page.locator('.pdfp-page[data-page="1"]');
  const r = (await frame.boundingBox())!;
  await page.keyboard.press('Alt+x');
  await expect(page.locator('.sd-region')).toBeVisible();
  await page.mouse.move(r.x + r.width * 0.2, r.y + 60);
  await page.mouse.down();
  await page.mouse.move(r.x + r.width * 0.6, r.y + 160, { steps: 6 });
  await page.mouse.up();
  const bar = page.getByRole('dialog', { name: 'Capture' });
  await expect(bar).toContainText('Region of page 1');
  await bar.getByRole('button', { name: /^Send to/ }).click();
  await expect(bar).toHaveCount(0);

  const box = frame.locator('.sd-pdfbox');
  await expect(box).toHaveCount(1);
  const card = page.locator('.sd-pdfmargin .sd-gloss');
  await expect(card).toHaveCount(1);
  await expect(card).toContainText('Page 1');
  const f = (await frame.boundingBox())!;
  const b = (await box.boundingBox())!;
  expect(Math.abs(b.x - (r.x + r.width * 0.2))).toBeLessThan(4);
  expect(Math.abs(b.y - (r.y + 60))).toBeLessThan(4);
  expect((await card.boundingBox())!.x).toBeGreaterThan(f.x + f.width);
  // An empty gloss shows on hover, as in the quiet reader's margins.
  await card.hover();
  await card.getByRole('textbox', { name: 'Gloss' }).fill('The diagram of the spheres');
  await card.getByRole('button', { name: 'Show in document' }).click();
  const doc = page.getByRole('dialog', { name: 'Desk document' });
  await expect(doc.locator('.desk-embed', { hasText: 'The diagram of the spheres' })).toHaveCount(1);
});

test('the Highlighter lets the page show through its fill, takes a colour, and can be outline only', async ({ page }) => {
  await openScan(page);
  const frame = page.locator('.pdfp-page[data-page="1"]');
  const r = (await frame.boundingBox())!;
  await page.keyboard.press('Alt+x');
  await page.mouse.move(r.x + r.width * 0.2, r.y + 60);
  await page.mouse.down();
  await page.mouse.move(r.x + r.width * 0.6, r.y + 160, { steps: 6 });
  await page.mouse.up();
  await page.getByRole('dialog', { name: 'Capture' }).getByRole('button', { name: /^Send to/ }).click();
  const box = frame.locator('.sd-pdfbox');
  await expect(box).toHaveCount(1);
  await page.mouse.move(5, 5);
  // One pixel of the screen, read back from a screenshot.
  const pixel = async (x: number, y: number) => {
    const png = await page.screenshot({ clip: { x, y, width: 1, height: 1 } });
    return page.evaluate(async (b64) => {
      const img = new Image();
      img.src = 'data:image/png;base64,' + b64;
      await img.decode();
      const c = new OffscreenCanvas(1, 1);
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      return Array.from(ctx.getImageData(0, 0, 1, 1).data.slice(0, 3));
    }, png.toString('base64'));
  };
  const b = (await box.boundingBox())!;
  const paper = await pixel(b.x + b.width / 2, b.y + b.height + 40);
  const under = await pixel(b.x + b.width / 2, b.y + b.height / 2);
  // The fill multiplies with the page: never lighter than the page under it (an opaque fill covered it).
  for (let i = 0; i < 3; i++) expect(under[i]).toBeLessThanOrEqual(paper[i] + 2);
  expect(under).not.toEqual(paper);

  // Night pages (dark paper, light print): the highlight lifts the paper instead, never darkening it.
  await page.locator('.qr-dock').getByRole('button', { name: 'Display', exact: true }).click();
  await page.getByRole('dialog', { name: 'Display' }).getByRole('group', { name: 'Pages' }).getByRole('button', { name: 'Night' }).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.sd-pdfdesk--night')).toHaveCount(1);
  await page.mouse.move(5, 5);
  const nightPaper = await pixel(b.x + b.width / 2, b.y + b.height + 40);
  const nightUnder = await pixel(b.x + b.width / 2, b.y + b.height / 2);
  for (let i = 0; i < 3; i++) expect(nightUnder[i]).toBeGreaterThanOrEqual(nightPaper[i] - 2);
  expect(nightUnder).not.toEqual(nightPaper);
  await page.locator('.qr-dock').getByRole('button', { name: 'Display', exact: true }).click();
  await page.getByRole('dialog', { name: 'Display' }).getByRole('group', { name: 'Pages' }).getByRole('button', { name: 'Paper' }).click();
  await page.keyboard.press('Escape');

  // Settings → Highlighter: with no outline, turning the fill off brings the outline back, and it cannot then be turned off.
  await page.click('.navbar__settings');
  const section = page.locator('.settings-section', { has: page.getByRole('heading', { name: 'Highlighter' }) });
  await section.scrollIntoViewIfNeeded();
  // A colour: the fill and the outlines follow it.
  const fillOf = () => page.evaluate(() => getComputedStyle(document.querySelector('.sd-pdfbox')!, '::before').backgroundColor);
  expect(await fillOf()).toBe('rgba(246, 234, 208, 0.7)');
  await expect(section.getByRole('button', { name: 'Cream' })).toHaveAttribute('aria-pressed', 'true');
  await section.getByRole('button', { name: 'Blue' }).click();
  await expect(section.getByRole('button', { name: 'Blue' })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(fillOf).toBe('rgba(111, 163, 201, 0.7)');
  await section.getByLabel('Custom colour').fill('#ff8800');
  await expect.poll(fillOf).toBe('rgba(255, 136, 0, 0.7)');
  await expect(section.locator('.hl-colours__custom')).toHaveAttribute('data-on', 'true');
  await section.getByRole('button', { name: 'Off' }).click();
  await section.getByRole('checkbox', { name: 'Fill' }).uncheck();
  await expect(section.getByRole('button', { name: 'Off' })).toHaveCount(0);
  await expect(section.getByRole('button', { name: 'Always' })).toHaveAttribute('aria-pressed', 'true');
  const prefs = await page.evaluate(() => Object.entries(localStorage).find(([, v]) => v.includes('pdfHighlightFill'))?.[1] ?? '');
  expect(prefs).toContain('"pdfHighlightFill":false');
  expect(prefs).toContain('"pdfHighlightOutline":"always"');
});

test.describe('margin beside PDF pages', () => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR42mP8z8Dwn4GBgYGJAQoAADUBAf8Ik8gAAAAASUVORK5CYII=', 'base64');

  test('double-tap writes a note tied to that height of the page', async ({ page }) => {
    await openScan(page);
    const area = page.locator('.sd-pdfmargin__area');
    const a = (await area.boundingBox())!;
    const frame = (await page.locator('.pdfp-page[data-page="1"]').boundingBox())!;
    await page.mouse.dblclick(a.x + a.width / 2, frame.y + 200);
    const note = page.getByRole('textbox', { name: 'Margin note' });
    await expect(note).toBeFocused();
    await page.keyboard.type('Why the spheres? See page two');
    await page.locator('.sd-gloss--m').getByRole('button', { name: 'Question', exact: true }).click();
    await expect(page.locator('.sd-gloss--question')).toHaveCount(1);
    // Tie to words works here too: by dragging over the words next (see the highlighting tests).
    await expect(page.getByRole('button', { name: 'Tie to words' })).toHaveCount(1);
    // No box on the page for a note, and it stays after leaving it.
    await page.keyboard.press('Escape');
    await expect(page.locator('.sd-pdfbox')).toHaveCount(0);
    await expect(page.getByRole('textbox', { name: 'Margin note' })).toHaveValue('Why the spheres? See page two');
    // Its place is the page and the height tapped.
    const top = (await page.locator('.sd-gloss--question').boundingBox())!.y;
    expect(Math.abs(top + 16 - (frame.y + 200))).toBeLessThan(24);
  });

  test('Alt+U places an image in the margin beside the pages', async ({ page }) => {
    await openScan(page);
    await page.keyboard.press('Alt+u');
    const pull = page.getByRole('dialog', { name: 'Pull in' }).or(page.getByRole('complementary', { name: 'Pull in' }));
    await expect(pull.getByRole('button', { name: 'Right margin' })).toHaveAttribute('aria-pressed', 'true');
    await expect(pull.getByRole('button', { name: 'Left margin' })).toHaveCount(0);
    await page.getByLabel('Image file').setInputFiles({ name: 'figure.png', mimeType: 'image/png', buffer: png });
    await expect(page.locator('.sd-pdfmargin .sd-gloss .sd-frame img')).toHaveCount(1);
  });
});

test.describe('capture trip', () => {
  /** The sample book and a scanned PDF in the library; the sample open. */
  async function twoBooks(page: Page) {
    await page.goto('/');
    await page.waitForSelector('.navbar__settings', { timeout: 15000 });
    await page.locator('.navbar__item', { hasText: 'Library' }).click();
    await page.setInputFiles('.library__actions input[type=file]', { name: 'scan.pdf', mimeType: 'application/pdf', buffer: Buffer.from(makePdf([{ image: true }, { image: true }])) });
    await expect(page.locator('.book-card')).toHaveCount(1, { timeout: 30000 });
    await page.click('text=Try the sample book');
    await expect(page.locator('.book-card')).toHaveCount(2, { timeout: 15000 });
    await page.locator('.book-card').filter({ hasNotText: 'scan' }).locator('.book-card__open').click();
    await page.waitForSelector('.qr-chapter .ar-word', { timeout: 15000 });
    await expect(page.locator('.sd-margins__area').last()).toBeVisible();
  }

  async function goToScan(page: Page) {
    await page.keyboard.press('Alt+u');
    const pull = page.getByRole('dialog', { name: 'Pull in' }).or(page.getByRole('complementary', { name: 'Pull in' }));
    await expect(pull.getByRole('button', { name: 'Right margin' })).toHaveAttribute('aria-pressed', 'true');
    await pull.getByText('Go to another book…').click();
    await pull.locator('.dsearch__entry', { hasText: 'scan' }).click();
    await expect(page.locator('.pdfp .qr-where--right')).toContainText('Page 1 of 2', { timeout: 20000 });
    const bar = page.getByRole('region', { name: 'Capture trip' });
    await expect(bar).toBeVisible();
    return bar;
  }

  test('captures in another book and comes back with it in the margin', async ({ page }) => {
    await twoBooks(page);
    const bar = await goToScan(page);
    await bar.getByRole('button', { name: 'Capture Alt X', exact: true }).click();
    await expect(bar).toHaveCount(0);
    const r = (await page.locator('.pdfp-page[data-page="1"]').boundingBox())!;
    await page.mouse.move(r.x + r.width * 0.2, r.y + 60);
    await page.mouse.down();
    await page.mouse.move(r.x + r.width * 0.6, r.y + 160, { steps: 6 });
    await page.mouse.up();
    await page.getByRole('dialog', { name: 'Capture' }).getByRole('button', { name: /^Send to/ }).click();

    // Back in the sample, with the region beside the page it was left on.
    await page.waitForSelector('.qr-chapter .ar-word', { timeout: 15000 });
    await expect(page.locator('.sd-toast')).toContainText('filed in the right margin');
    const gloss = page.locator('.sd-margins .sd-gloss', { hasText: 'Page 1' });
    await expect(gloss).toHaveCount(1);
    await expect(gloss.locator('.sd-frame img')).toHaveCount(1);
    await expect(page.getByRole('region', { name: 'Capture trip' })).toHaveCount(0);
  });

  test('a trip started from the desk document comes back to it, at the capture', async ({ page }) => {
    await twoBooks(page);
    await page.keyboard.press('d');
    const doc = page.getByRole('dialog', { name: 'Desk document' });
    await doc.locator('.sd-side').getByRole('button', { name: 'Pull in' }).click();
    const pull = page.getByRole('dialog', { name: 'Pull in' }).or(page.getByRole('complementary', { name: 'Pull in' }));
    await pull.getByText('Go to another book…').click();
    await pull.locator('.dsearch__entry', { hasText: 'scan' }).click();
    await expect(page.locator('.pdfp .qr-where--right')).toContainText('Page 1 of 2', { timeout: 20000 });
    const bar = page.getByRole('region', { name: 'Capture trip' });
    await bar.getByRole('button', { name: 'Capture Alt X', exact: true }).click();
    const r = (await page.locator('.pdfp-page[data-page="1"]').boundingBox())!;
    await page.mouse.move(r.x + r.width * 0.2, r.y + 60);
    await page.mouse.down();
    await page.mouse.move(r.x + r.width * 0.6, r.y + 160, { steps: 6 });
    await page.mouse.up();
    await page.getByRole('dialog', { name: 'Capture' }).getByRole('button', { name: /^Send to/ }).click();

    await expect(doc).toBeVisible({ timeout: 15000 });
    await expect(doc.locator('.desk-embed.sd-emb--flash')).toContainText('Page 1');
    await expect(page.locator('.sd-toast')).toContainText('filed in the inbox');
  });

  test('Capture and stay files each capture and keeps the trip; Done goes back, and Pull in offers the book again', async ({ page }) => {
    await twoBooks(page);
    const bar = await goToScan(page);
    const r = (await page.locator('.pdfp-page[data-page="1"]').boundingBox())!;
    for (const [i, y] of [60, 260].entries()) {
      await page.keyboard.press('Shift+Alt+x');
      await expect(bar).toHaveCount(0);
      await page.mouse.move(r.x + r.width * 0.2, r.y + y);
      await page.mouse.down();
      await page.mouse.move(r.x + r.width * 0.6, r.y + y + 90, { steps: 6 });
      await page.mouse.up();
      await page.getByRole('dialog', { name: 'Capture' }).getByRole('button', { name: /^Send to/ }).click();
      await expect(bar).toBeVisible();
      await expect(bar).toContainText(`${i + 1} filed`);
    }
    await bar.getByRole('button', { name: /^Done, go back/ }).click();
    await page.waitForSelector('.qr-chapter .ar-word', { timeout: 15000 });
    await expect(page.locator('.sd-toast')).toContainText('Captured 2 things from');
    await expect(page.locator('.sd-margins .sd-gloss', { hasText: 'Page 1' })).toHaveCount(2);

    // Alt+U then Enter: the same trip again.
    await page.keyboard.press('Alt+u');
    const pull = page.getByRole('dialog', { name: 'Pull in' }).or(page.getByRole('complementary', { name: 'Pull in' }));
    await expect(pull.locator('[role=option][aria-selected=true]')).toContainText('Back to');
    await page.keyboard.press('Enter');
    await expect(page.locator('.pdfp .qr-where--right')).toContainText('Page 1 of 2', { timeout: 20000 });
    await expect(page.getByRole('region', { name: 'Capture trip' })).toContainText('right margin');
  });

  test('Esc goes back without capturing', async ({ page }) => {
    await twoBooks(page);
    await goToScan(page);
    await page.keyboard.press('Escape');
    await page.waitForSelector('.qr-chapter .ar-word', { timeout: 15000 });
    await expect(page.locator('.sd-toast')).toContainText('nothing captured');
    await expect(page.locator('.sd-gloss')).toHaveCount(0);
    await page.keyboard.press('Alt+i');
    await expect(page.locator('.dsearch__hint', { hasText: 'Nothing here yet' })).toBeVisible();
  });
});

test.describe('D opens the desk document', () => {
  test('in the quiet reader, but not while typing in a margin note', async ({ page }) => {
    await openSample(page);
    const doc = page.getByRole('dialog', { name: 'Desk document' });
    await page.keyboard.press('d');
    await expect(doc).toBeVisible();
    // Typing in the document is typing, not the shortcut.
    await page.keyboard.press('Escape');
    await expect(doc).toHaveCount(0);

    const area = page.locator('.sd-margins__area').last();
    const box = (await area.boundingBox())!;
    await page.mouse.dblclick(box.x + box.width / 2, await lineY(page, 1));
    const note = page.getByRole('textbox', { name: 'Margin note' });
    await expect(note).toBeFocused();
    await page.keyboard.type('dd');
    await expect(note).toHaveValue('dd');
    await expect(doc).toHaveCount(0);
  });

  test('on PDF pages', async ({ page }) => {
    await openScan(page);
    await page.keyboard.press('d');
    await expect(page.getByRole('dialog', { name: 'Desk document' })).toBeVisible();
  });
});

test.describe('desk document', () => {
  /** A quote (region capture of the first line) and a concept, then the document open. */
  async function docWithItems(page: Page) {
    await openSample(page);
    const box = await firstLineBox(page);
    await page.keyboard.press('Alt+x');
    await page.mouse.move(box.right, box.top);
    await page.mouse.down();
    await page.mouse.move(box.left, box.bottom, { steps: 6 });
    await page.mouse.up();
    await page.getByRole('dialog', { name: 'Capture' }).getByRole('button', { name: /^Send to/ }).click();
    await page.keyboard.press('Alt+c');
    await page.getByRole('textbox', { name: 'Concept' }).fill('Group feeling');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: 'Write a concept' })).toHaveCount(0);
    await page.keyboard.press('d');
    const doc = page.getByRole('dialog', { name: 'Desk document' });
    await expect(doc.locator('.desk-embed')).toHaveCount(2);
    return doc;
  }

  test('items have a note, Remove from page and Go to source', async ({ page }) => {
    const doc = await docWithItems(page);
    const concept = doc.locator('.desk-embed', { hasText: 'Group feeling' });
    await concept.hover();
    await concept.getByRole('button', { name: 'Add note' }).click();
    const note = concept.getByRole('textbox', { name: 'Note on this item' });
    await expect(note).toBeFocused();
    await page.keyboard.type('The bond that founds dynasties');
    await doc.locator('.sd-doc__title').click();
    await expect(concept.locator('.sd-emb__body')).toHaveText('The bond that founds dynasties');
    await expect(concept.getByRole('button', { name: 'Edit note' })).toHaveCount(1);

    await concept.hover();
    await concept.getByRole('button', { name: 'Remove from page' }).click();
    await expect(doc.locator('.desk-embed', { hasText: 'Group feeling' })).toHaveCount(0);
    await expect(doc.locator('.sd-side').getByRole('button', { name: 'Put back' })).toHaveCount(1);

    const quote = doc.locator('.desk-embed').first();
    await quote.hover();
    await quote.getByRole('button', { name: 'Go to source' }).click();
    await expect(doc).toHaveCount(0);
    await expect(page.locator('.qr-chapter .ar-word').first()).toBeVisible();
  });

  test('each kind of item has its own look; a screenshot opens at full size', async ({ page }) => {
    await openSample(page);
    await page.keyboard.press('Alt+u');
    await page.getByRole('button', { name: 'Inbox', exact: true }).click();
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR42mP8z8Dwn4GBgYGJAQoAADUBAf8Ik8gAAAAASUVORK5CYII=', 'base64');
    await page.getByLabel('Image file').setInputFiles({ name: 'figure.png', mimeType: 'image/png', buffer: png });
    await page.keyboard.press('Alt+c');
    await page.getByRole('textbox', { name: 'Concept' }).fill('Group feeling');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: 'Write a concept' })).toHaveCount(0);
    await page.keyboard.press('d');
    const doc = page.getByRole('dialog', { name: 'Desk document' });
    await expect(doc.locator('.desk-embed.sd-emb--capture')).toHaveCount(1);
    await expect(doc.locator('.desk-embed.sd-emb--concept')).toHaveCount(1);
    await doc.locator('.sd-emb__img').click();
    const zoom = page.getByRole('dialog', { name: 'Image at full size' });
    await expect(zoom.locator('img')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(zoom).toHaveCount(0);
    await expect(doc).toBeVisible();
  });

  test('"/" on an empty line puts an item there; a side-panel row can be dragged into the text', async ({ page }) => {
    const doc = await docWithItems(page);
    const editor = doc.getByRole('textbox', { name: 'Document text' });
    // Write a first line above the items, then put the concept right after it.
    await editor.locator('.desk-embed').first().evaluate((el) => {
      const p = document.createElement('p');
      p.textContent = 'Opening thoughts';
      el.parentElement!.insertBefore(p, el);
    });
    await editor.locator('p', { hasText: 'Opening thoughts' }).click();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('/');
    const picker = page.getByRole('dialog', { name: 'Put an item here' });
    await expect(picker).toBeVisible();
    await expect(picker.getByRole('option', { name: /Group feeling/ })).toContainText('Move here');
    await picker.getByRole('textbox').fill('group');
    await page.keyboard.press('Enter');
    await expect(picker).toHaveCount(0);
    const order = await editor.evaluate((ed) => Array.from(ed.children).map((c) => (c.classList.contains('desk-embed') ? 'embed:' + c.textContent!.slice(0, 13) : c.textContent)));
    expect(order.slice(0, 2)).toEqual(['Opening thoughts', 'embed:Group feeling']);

    // Esc in the picker leaves an empty line.
    await page.keyboard.type('/');
    await expect(picker).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(picker).toHaveCount(0);
    await expect(doc).toBeVisible();

    // Drag the quote's row to the top of the text.
    const row = doc.locator('.sd-order__i', { hasText: 'Quote' });
    await row.dragTo(editor.locator('p', { hasText: 'Opening thoughts' }), { targetPosition: { x: 20, y: 2 } });
    await expect(editor.locator(':scope > *').first()).toHaveClass(/sd-emb--quote/);
  });

  test('lists, quotations, bold and the toolbar; kept after closing', async ({ page }) => {
    await openSample(page);
    await page.keyboard.press('d');
    const doc = page.getByRole('dialog', { name: 'Desk document' });
    const editor = doc.getByRole('textbox', { name: 'Document text' });
    await editor.locator('p').last().click();
    await page.keyboard.type('- first point');
    await page.keyboard.press('Enter');
    await page.keyboard.type('second point');
    await expect(editor.locator('ul li')).toHaveCount(2);
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await page.keyboard.type('> a saying');
    await expect(editor.locator('blockquote')).toHaveText('a saying');
    await page.keyboard.press('Enter');
    await doc.getByRole('button', { name: 'Paragraph' }).or(doc.getByRole('button', { name: 'Quotation' })).first().click();
    await page.keyboard.type('plain ');
    await doc.getByRole('button', { name: 'Bold' }).click();
    await page.keyboard.type('strong');
    await expect(editor.locator('b, strong')).toContainText('strong');

    await doc.getByRole('button', { name: 'Back to the page' }).click();
    await page.keyboard.press('d');
    await expect(editor.locator('ul li')).toHaveCount(2);
    await expect(editor.locator('blockquote')).toHaveText('a saying');
    await expect(editor.locator('b, strong')).toContainText('strong');
  });

  test('the side panel outlines the headings; word count and Saved', async ({ page }) => {
    const doc = await docWithItems(page);
    const editor = doc.getByRole('textbox', { name: 'Document text' });
    await editor.locator('p').last().click();
    await page.keyboard.type('# Village');
    await page.keyboard.press('Enter');
    await page.keyboard.type('three more words');
    await expect(doc.locator('.sd-doc__count')).toHaveText('4 words');
    await expect(doc.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible();
    // File the concept under the heading: the heading shows one item.
    const row = doc.locator('.sd-order__i', { hasText: 'Group feeling' });
    await row.hover();
    await row.getByRole('combobox', { name: 'File under a heading' }).selectOption({ label: 'Village' });
    await expect(doc.locator('.sd-order__h', { hasText: 'Village' }).locator('.sd-order__hn')).toHaveText('1');
    await doc.locator('.sd-order__hbtn', { hasText: 'Village' }).click();
    await expect(editor.locator('h3')).toBeInViewport();
  });

  test('Export saves Markdown with citations and a Word file', async ({ page }) => {
    const doc = await docWithItems(page);
    await doc.getByRole('button', { name: 'Export' }).click();
    const [md] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: /Save as Markdown/ }).click()]);
    expect(md.suggestedFilename()).toMatch(/\.md$/);
    const text = await (await md.createReadStream()).toArray().then((c) => Buffer.concat(c).toString('utf8'));
    expect(text).toContain('**Group feeling**');
    expect(text).toMatch(/^> .+\n>\n> — /m);
    await doc.getByRole('button', { name: 'Export' }).click();
    const [docx] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: /Save as Word/ }).click()]);
    expect(docx.suggestedFilename()).toMatch(/\.docx$/);
    const bytes = await (await docx.createReadStream()).toArray().then((c) => Buffer.concat(c));
    expect(bytes.subarray(0, 2).toString()).toBe('PK');
  });

  test('All desks finds, makes, opens and deletes desks', async ({ page }) => {
    const doc = await docWithItems(page);
    await doc.getByRole('button', { name: /^All desks/ }).click();
    const list = page.getByRole('dialog', { name: 'All desks' });
    await expect(list.locator('.sd-dl__row')).toHaveCount(1);
    await expect(list).toContainText('2 items');
    await list.getByRole('textbox', { name: 'Find a desk' }).fill('Essay on rule');
    await list.getByRole('button', { name: /New desk/ }).click();
    await expect(list).toHaveCount(0);
    await expect(doc.locator('.sd-doc__title')).toHaveText('Essay on rule');
    await expect(doc.getByRole('tab', { name: 'Essay on rule' })).toHaveAttribute('aria-selected', 'true');

    // Search reaches what a desk says, not only its title.
    await doc.getByRole('button', { name: /^All desks/ }).click();
    await list.getByRole('textbox', { name: 'Find a desk' }).fill('Group feeling');
    await expect(list.locator('.sd-dl__row')).toHaveCount(0);
    await list.getByRole('textbox', { name: 'Find a desk' }).fill('');
    const essay = list.locator('.sd-dl__row', { hasText: 'Essay on rule' });
    await essay.hover();
    await essay.getByRole('button', { name: 'Delete Essay on rule' }).click();
    await essay.getByRole('button', { name: /Delete it/ }).click();
    await expect(list.locator('.sd-dl__row', { hasText: 'Essay on rule' })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(list).toHaveCount(0);
    await expect(doc).toBeVisible();
  });

  test('room between items: the + line, Enter on a selected item, arrows stop on items', async ({ page }) => {
    const doc = await docWithItems(page);
    const editor = doc.getByRole('textbox', { name: 'Document text' });
    const kinds = () => editor.evaluate((ed) => Array.from(ed.children).map((c) => (c.classList.contains('desk-embed') ? 'item' : c.tagName === 'P' && !c.textContent?.trim() ? 'empty' : c.tagName.toLowerCase() + ':' + c.textContent)));
    // Packed: the two items touch.
    expect((await kinds()).slice(0, 2)).toEqual(['item', 'item']);

    // Hover the gap between them: a + line; clicking it opens a line there to type on.
    const [a, b] = [(await editor.locator('.desk-embed').nth(0).boundingBox())!, (await editor.locator('.desk-embed').nth(1).boundingBox())!];
    await page.mouse.move(a.x + a.width / 2, (a.y + a.height + b.y) / 2);
    const plus = doc.getByRole('button', { name: 'Add a line here' });
    await expect(plus).toBeVisible();
    await plus.click();
    await page.keyboard.type('Between the two');
    expect((await kinds()).slice(0, 3)).toEqual(['item', 'p:Between the two', 'item']);

    // Click an item, Shift+Enter: a line above it.
    await editor.locator('.desk-embed').first().locator('.sd-emb__head').click();
    await expect(editor.locator('.desk-embed').first()).toHaveClass(/sd-emb--sel/);
    await page.keyboard.press('Shift+Enter');
    await page.keyboard.type('Before everything');
    expect((await kinds()).slice(0, 2)).toEqual(['p:Before everything', 'item']);

    // Down from that line stops on the item; Enter opens a line under it.
    await page.keyboard.press('ArrowDown');
    await expect(editor.locator('.desk-embed').first()).toHaveClass(/sd-emb--sel/);
    await page.keyboard.press('Enter');
    await page.keyboard.type('Right after the quote');
    expect((await kinds()).slice(0, 4)).toEqual(['p:Before everything', 'item', 'p:Right after the quote', 'p:Between the two']);

    // Kept after closing.
    await doc.getByRole('button', { name: 'Back to the page' }).click();
    await page.keyboard.press('d');
    expect((await kinds()).slice(0, 4)).toEqual(['p:Before everything', 'item', 'p:Right after the quote', 'p:Between the two']);
  });

  test('Arabic lines run right to left and source lines keep their parts in order', async ({ page }) => {
    const doc = await docWithItems(page);
    const editor = doc.getByRole('textbox', { name: 'Document text' });
    await editor.locator('p').last().click();
    await page.keyboard.type('العصبية هي الرابطة');
    const p = editor.locator('p', { hasText: 'العصبية' });
    expect(await p.evaluate((el) => getComputedStyle(el).unicodeBidi)).toBe('plaintext');
    await expect(doc.locator('.desk-embed').first().locator('.sd-emb__meta bdi')).toHaveCount(2);
  });
});

test.describe('highlighting on scanned PDF pages', () => {
  const ENGINE_URL = 'http://ocr.test/ocr';
  /** A test engine: two words side by side in the middle of whatever crop it is sent. */
  async function twoWordEngine(page: Page) {
    await page.route(`${ENGINE_URL}**`, async (route) => {
      const png = route.request().postDataBuffer();
      const [w, h] = png && png.length > 24 ? [png.readUInt32BE(16), png.readUInt32BE(20)] : [400, 200];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' },
        body: JSON.stringify({ words: [{ text: 'المدرسة', x: w * 0.55, y: h * 0.4, w: w * 0.3, h: h * 0.2 }, { text: 'الكبيرة', x: w * 0.15, y: h * 0.4, w: w * 0.3, h: h * 0.2 }] }),
      });
    });
    await page.addInitScript((url) => {
      localStorage.setItem('arabic-reader:pdfOcr', JSON.stringify({ engineId: 'custom:t', custom: [{ id: 'custom:t', name: 'Test engine', url }] }));
    }, ENGINE_URL);
  }

  async function dragOnPage(page: Page, from: [number, number], to: [number, number]) {
    const r = (await page.locator('.pdfp-page[data-page="1"]').boundingBox())!;
    await page.mouse.move(r.x + r.width * from[0], r.y + r.height * from[1]);
    await page.mouse.down();
    await page.mouse.move(r.x + r.width * ((from[0] + to[0]) / 2), r.y + r.height * ((from[1] + to[1]) / 2), { steps: 4 });
    await page.mouse.move(r.x + r.width * to[0], r.y + r.height * to[1], { steps: 4 });
    await page.mouse.up();
  }

  test('a drag snaps to the words read there and starts a gloss', async ({ page }) => {
    await twoWordEngine(page);
    await openScan(page);
    await dragOnPage(page, [0.2, 0.1], [0.7, 0.2]);
    const bar = page.getByRole('dialog', { name: 'Highlight on the page' });
    await expect(bar).toContainText('المدرسة الكبيرة');
    await expect(bar.getByRole('button', { name: /Snap to words/ })).toHaveAttribute('aria-pressed', 'true');
    await bar.getByRole('button', { name: 'Gloss in the margin' }).click();
    await expect(bar).toHaveCount(0);
    await expect(page.locator('.pdfp-page[data-page="1"] .sd-pdfbox')).toHaveCount(1);
    const gloss = page.locator('.sd-pdfmargin .sd-gloss', { hasText: 'المدرسة الكبيرة' });
    await expect(gloss.getByRole('textbox', { name: 'Gloss' })).toBeFocused();
    await page.keyboard.type('the big school');
    // No dictionary popup from the drag's closing click.
    await expect(page.locator('.dict-popup')).toHaveCount(0);
  });

  test('Quote in sketch: the words go into the open sheet, linked both ways', async ({ page }) => {
    await twoWordEngine(page);
    await openScan(page);
    await page.keyboard.press('Alt+k');
    const panel = page.getByRole('complementary', { name: 'Sketch' });
    await expect(panel).toBeVisible();
    await dragOnPage(page, [0.2, 0.1], [0.7, 0.2]);
    const bar = page.getByRole('dialog', { name: 'Highlight on the page' });
    await expect(bar).toContainText('المدرسة الكبيرة');
    await bar.getByRole('button', { name: 'Quote in sketch' }).click();
    // A quote node with its way back to the words.
    const quote = panel.locator('.sk-node--quote');
    await expect(quote).toContainText('المدرسة الكبيرة');
    await expect(quote.getByRole('button', { name: 'Go to it on the page' })).toBeVisible();
    await expect(panel.locator('.sk-foot [role=status]')).toContainText('Quoted in the sheet');
    // The highlight on the page says it is in a sketch.
    await expect(page.locator('.pdfp-page[data-page="1"] .sd-pdfbox .sd-pdfbox__sk')).toHaveCount(1);
    // Pointing at the quote draws its line to the page; ↗ goes there and flashes the words.
    await quote.hover();
    await expect(panel.locator('.sk-lead path')).toHaveCount(1);
    await page.locator('.pdfp__stage').evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
    await quote.getByRole('button', { name: 'Go to it on the page' }).click();
    await expect(page.locator('.sk-flash')).not.toHaveCount(0);
  });

  test('with snapping off the drag stays an image region', async ({ page }) => {
    await twoWordEngine(page);
    await openScan(page);
    await dragOnPage(page, [0.2, 0.3], [0.6, 0.4]);
    const bar = page.getByRole('dialog', { name: 'Highlight on the page' });
    await bar.getByRole('button', { name: /Snap to words/ }).click();
    await expect(bar.getByRole('button', { name: 'Gloss this region' })).toBeVisible();
    await bar.getByRole('button', { name: 'Send to inbox' }).click();
    await page.keyboard.press('Alt+i');
    await expect(page.locator('.dsearch__entry', { hasText: 'Region of page 1' })).toHaveCount(1);
  });

  test('a margin note ties to words dragged over next', async ({ page }) => {
    await twoWordEngine(page);
    await openScan(page);
    const area = page.locator('.sd-pdfmargin__area');
    const a = (await area.boundingBox())!;
    const frame = (await page.locator('.pdfp-page[data-page="1"]').boundingBox())!;
    await page.mouse.dblclick(a.x + a.width / 2, frame.y + 300);
    await expect(page.getByRole('textbox', { name: 'Margin note' })).toBeFocused();
    await page.keyboard.type('Compare with page 40');
    await page.locator('.sd-gloss--m').getByRole('button', { name: 'Tie to words' }).click();
    await expect(page.locator('.sd-pdfsel__tie')).toBeVisible();
    await dragOnPage(page, [0.2, 0.5], [0.7, 0.6]);
    await page.getByRole('dialog', { name: 'Highlight on the page' }).getByRole('button', { name: /Tie the note/ }).click();
    await expect(page.locator('.sd-toast')).toContainText('Tied to the words');
    await expect(page.locator('.pdfp-page[data-page="1"] .sd-pdfbox')).toHaveCount(1);
    await expect(page.locator('.sd-gloss--m')).toContainText('المدرسة الكبيرة');
  });
});

test.describe('right-click ring in the margins', () => {
  test('a margin opens the ring: write here, and the desk shortcuts', async ({ page }) => {
    await openSample(page);
    const area = page.locator('.sd-margins__area').last();
    const box = (await area.boundingBox())!;
    const y = await lineY(page, 1);
    await page.mouse.click(box.x + box.width / 2, y, { button: 'right' });
    const ring = page.getByRole('menu', { name: 'Margin' });
    await expect(ring).toBeVisible();
    await expect(ring.getByRole('menuitem')).toHaveCount(8);
    await expect(ring.getByRole('menuitem', { name: /Pull in/ })).toContainText('Alt U');
    await ring.getByRole('menuitem', { name: /Write a note here/ }).click();
    await expect(ring).toHaveCount(0);
    await expect(page.getByRole('textbox', { name: 'Margin note' })).toBeFocused();
    await page.keyboard.type('Why the village?');
    await page.keyboard.press('Escape');

    // The note's own ring: turn it into a question.
    const note = page.locator('.sd-gloss--m');
    const nb = (await note.boundingBox())!;
    await page.mouse.click(nb.x + 3, nb.y + 3, { button: 'right' });
    const noteRing = page.getByRole('menu', { name: 'Margin note' });
    await noteRing.getByRole('menuitem', { name: /Question/ }).click();
    await expect(page.locator('.sd-gloss--question')).toHaveCount(1);

    // Number keys pick a button; Esc closes.
    await page.mouse.click(box.x + box.width / 2, y + 120, { button: 'right' });
    await expect(ring).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(ring).toHaveCount(0);
    await page.mouse.click(box.x + box.width / 2, y + 120, { button: 'right' });
    await page.keyboard.press('5');
    await expect(page.getByRole('dialog', { name: 'Desk document' })).toBeVisible();
  });

  test('beside PDF pages: the strip has the ring, and a highlight box has its own', async ({ page }) => {
    await openScan(page);
    const frame = page.locator('.pdfp-page[data-page="1"]');
    const r = (await frame.boundingBox())!;
    await page.keyboard.press('Alt+x');
    await page.mouse.move(r.x + r.width * 0.2, r.y + 60);
    await page.mouse.down();
    await page.mouse.move(r.x + r.width * 0.6, r.y + 160, { steps: 6 });
    await page.mouse.up();
    await page.getByRole('dialog', { name: 'Capture' }).getByRole('button', { name: /^Send to/ }).click();
    await expect(frame.locator('.sd-pdfbox')).toHaveCount(1);

    const strip = (await page.locator('.sd-pdfmargin__area').boundingBox())!;
    await page.mouse.click(strip.x + strip.width / 2, strip.y + strip.height - 60, { button: 'right' });
    await expect(page.getByRole('menu', { name: 'Margin' })).toBeVisible();
    await page.keyboard.press('Escape');

    const b = (await frame.locator('.sd-pdfbox').boundingBox())!;
    await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2, { button: 'right' });
    const boxRing = page.getByRole('menu', { name: 'Highlight' });
    await boxRing.getByRole('menuitem', { name: /Delete highlight/ }).click();
    await expect(frame.locator('.sd-pdfbox')).toHaveCount(0);
  });
});

test.describe('dock switch and lit cards', () => {
  test('Margins and Document in the dock, and in the Focus tool rail', async ({ page }) => {
    await openSample(page);
    const dock = page.locator('.qr-dock');
    const margins = dock.getByRole('button', { name: 'Margins' });
    await expect(margins).toHaveAttribute('aria-pressed', 'true');
    await margins.click();
    await expect(page.locator('.sd-margins')).toHaveCount(0);
    await expect(margins).toHaveAttribute('aria-pressed', 'false');
    await margins.click();
    await expect(page.locator('.sd-margins__area').first()).toBeVisible();

    await dock.getByRole('button', { name: 'Focus' }).click();
    await expect(page.locator('.sd-margins__area').first()).toBeVisible();
    await page.getByRole('group', { name: 'Focus' }).getByRole('button', { name: 'Tools' }).click();
    const rail = page.getByRole('navigation', { name: 'Reader tools' });
    await rail.getByRole('button', { name: /^Margins/ }).click();
    await expect(page.locator('.sd-margins')).toHaveCount(0);
    await rail.getByRole('button', { name: /^Margins/ }).click();
    await rail.getByRole('button', { name: /^Document/ }).click();
    await expect(page.getByRole('dialog', { name: 'Desk document' })).toBeVisible();
  });

  test('pointing at the words of an item lights its card', async ({ page }) => {
    await openSample(page);
    const box = await firstLineBox(page);
    await page.keyboard.press('Alt+x');
    await page.mouse.move(box.right, box.top);
    await page.mouse.down();
    await page.mouse.move(box.left, box.bottom, { steps: 6 });
    await page.mouse.up();
    await page.getByRole('dialog', { name: 'Capture' }).getByRole('button', { name: /^Send to/ }).click();
    const card = page.locator('.sd-gloss').first();
    await expect(card).toBeVisible();
    await expect(card).not.toHaveClass(/sd-gloss--lit/);
    const w = (await page.locator('.qr-chapter p .ar-word').first().boundingBox())!;
    await page.mouse.move(w.x + w.width / 2, w.y + w.height / 2);
    await expect(card).toHaveClass(/sd-gloss--lit/);
    await page.mouse.move(w.x + w.width / 2, w.y + 400);
    await expect(card).not.toHaveClass(/sd-gloss--lit/);
  });

  test('pointing at a highlighted box on a PDF page lights its card', async ({ page }) => {
    await openScan(page);
    const frame = page.locator('.pdfp-page[data-page="1"]');
    const r = (await frame.boundingBox())!;
    await page.keyboard.press('Alt+x');
    await page.mouse.move(r.x + r.width * 0.2, r.y + 60);
    await page.mouse.down();
    await page.mouse.move(r.x + r.width * 0.6, r.y + 160, { steps: 6 });
    await page.mouse.up();
    await page.getByRole('dialog', { name: 'Capture' }).getByRole('button', { name: /^Send to/ }).click();
    const card = page.locator('.sd-pdfmargin .sd-gloss');
    await expect(card).toHaveCount(1);
    const b = (await frame.locator('.sd-pdfbox').boundingBox())!;
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await expect(card).toHaveClass(/sd-gloss--lit/);
    await expect(frame.locator('.sd-pdfbox')).toHaveClass(/sd-pdfbox--on/);
    await page.mouse.move(b.x + b.width / 2, b.y + b.height + 200);
    await expect(card).not.toHaveClass(/sd-gloss--lit/);
  });
});
