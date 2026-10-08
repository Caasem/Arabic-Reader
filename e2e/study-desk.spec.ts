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
