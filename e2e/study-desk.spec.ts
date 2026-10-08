import { test, expect, type Page } from '@playwright/test';

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
    await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height * 0.6);
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
    await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height * 0.3);
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

  test('an empty note disappears when left', async ({ page }) => {
    await openSample(page);
    const area = page.locator('.sd-margins__area').last();
    const box = (await area.boundingBox())!;
    await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height * 0.5);
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
