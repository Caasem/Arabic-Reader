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
  await expect(page.locator('.reader__footer')).toContainText('Page 1 of 2', { timeout: 20000 });
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
    await expect(page.getByRole('button', { name: 'Tie to words' })).toHaveCount(0);
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
    await expect(page.locator('.reader__footer')).toContainText('Page 1 of 2', { timeout: 20000 });
    const bar = page.getByRole('region', { name: 'Capture trip' });
    await expect(bar).toBeVisible();
    return bar;
  }

  test('captures in another book and comes back with it in the margin', async ({ page }) => {
    await twoBooks(page);
    const bar = await goToScan(page);
    await bar.getByRole('button', { name: /^Capture/ }).click();
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
