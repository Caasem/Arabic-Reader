import { test, expect, type Page } from '@playwright/test';

/**
 * Alt+N writes a note on the selected text and Alt+F writes a flashcard, each in
 * a floating card that never blocks the page (src/noteCard, src/flashCard).
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

/** Selects the first paragraph's opening words, as a drag would. */
async function selectOpening(page: Page) {
  await page.evaluate(() => {
    const p = document.querySelector('.qr-chapter p')!;
    const range = document.createRange();
    range.setStart(p.firstChild!.firstChild ?? p.firstChild!, 0);
    range.setEnd(p.children[2]?.firstChild ?? p.lastChild!, 1);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
    document.querySelector('.qr-stage')!.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
  });
}

test('Alt+N writes a note on the selection and keeps floating', async ({ page }) => {
  await openSample(page);
  await selectOpening(page);
  await page.keyboard.press('Alt+n');

  const card = page.getByRole('dialog', { name: 'Note' });
  await expect(card).toBeVisible();
  await expect(card.locator('.fcard__quote')).not.toBeEmpty();
  await expect(card.getByRole('textbox', { name: 'Note' })).toBeFocused();

  // It does not block the page: no backdrop, and the book still takes clicks.
  await expect(page.locator('.dsearch-backdrop')).toHaveCount(0);

  await card.getByRole('textbox', { name: 'Note' }).fill('The girl goes to school');
  await card.getByRole('button', { name: 'Save' }).click();
  await expect(card.locator('[role=status]')).toContainText('Saved');
  await expect(card.getByRole('textbox', { name: 'Note' })).toHaveValue('');

  // The note is a highlight with that text, listed under Marks.
  await page.locator('.qr-dock').getByRole('button', { name: 'Marks', exact: true }).click();
  const drawer = page.locator('.qr-drawer');
  await expect(drawer.locator('.qr-hl-card')).toHaveCount(1);
  await expect(drawer.locator('.qr-hl-card__note')).toHaveText('The girl goes to school');

  // Alt+N again closes it.
  await page.keyboard.press('Alt+n');
  await expect(card).toHaveCount(0);
});

test('Alt+N with nothing selected notes the first sentence on the page', async ({ page }) => {
  await openSample(page);
  await page.keyboard.press('Alt+n');
  const card = page.getByRole('dialog', { name: 'Note' });
  await expect(card.locator('.fcard__hint').first()).toContainText('first sentence on this page');
  await card.getByRole('textbox', { name: 'Note' }).fill('A page note');
  await page.keyboard.press('Control+Enter');
  await expect(card.locator('[role=status]')).toContainText('Saved');
  await page.keyboard.press('Escape');
  await expect(card).toHaveCount(0);
});

test('the card can be dragged and is remembered where it was left', async ({ page }) => {
  await openSample(page);
  await page.keyboard.press('Alt+n');
  const card = page.getByRole('dialog', { name: 'Note' });
  const before = (await card.boundingBox())!;
  const grip = card.locator('.fcard__header');
  const g = (await grip.boundingBox())!;
  await page.mouse.move(g.x + 40, g.y + 10);
  await page.mouse.down();
  await page.mouse.move(g.x + 240, g.y + 160, { steps: 6 });
  await page.mouse.up();
  const after = (await card.boundingBox())!;
  expect(after.x).toBeGreaterThan(before.x + 150);
  expect(after.y).toBeGreaterThan(before.y + 100);

  await page.keyboard.press('Escape');
  await expect(card).toHaveCount(0);
  await page.keyboard.press('Alt+n');
  const reopened = (await card.boundingBox())!;
  expect(Math.abs(reopened.x - after.x)).toBeLessThan(2);
  expect(Math.abs(reopened.y - after.y)).toBeLessThan(2);
});

test('Escape asks before discarding a typed note', async ({ page }) => {
  await openSample(page);
  await page.keyboard.press('Alt+n');
  const card = page.getByRole('dialog', { name: 'Note' });
  await card.getByRole('textbox', { name: 'Note' }).fill('unsaved thought');
  await page.keyboard.press('Escape');
  await expect(card).toBeVisible();
  await expect(card.locator('[role=status]')).toContainText('Esc again');
  await page.keyboard.press('Escape');
  await expect(card).toHaveCount(0);
});

test('Alt+F writes a custom flashcard that joins the saved words', async ({ page }) => {
  await openSample(page);
  await selectOpening(page);
  await page.keyboard.press('Alt+f');

  const card = page.getByRole('dialog', { name: 'Flashcard' });
  await expect(card).toBeVisible();
  // A short selection fills the front.
  const front = card.getByPlaceholder('The word or phrase');
  await expect(front).not.toHaveValue('');

  await front.fill('مثال');
  await card.getByPlaceholder('The meaning, or any answer').fill('an example');
  await card.getByRole('button', { name: 'Add card' }).click();
  await expect(card.locator('[role=status]')).toContainText('Card added');
  await expect(front).toHaveValue('');

  // It is a saved word of this book, found under Words.
  await page.keyboard.press('Alt+f');
  await expect(card).toHaveCount(0);
  await page.locator('.qr-dock').getByRole('button', { name: 'Words', exact: true }).click();
  const drawer = page.locator('.qr-drawer');
  await expect(drawer.locator('.qr-word-row')).toHaveCount(1);
  await expect(drawer.locator('.qr-word-row__word')).toHaveText('مثال');

  // Typing the same front again says there is already a card.
  await page.keyboard.press('Alt+f');
  await card.getByPlaceholder('The word or phrase').fill('مثال');
  await expect(card.getByRole('button', { name: 'Edit it' })).toBeVisible();
});

test('both shortcuts can be switched off in Settings', async ({ page }) => {
  await openSample(page);
  await page.click('.navbar__settings');
  await page.locator('label', { hasText: 'Enable the Alt+N shortcut' }).locator('input').uncheck();
  await page.locator('label', { hasText: 'Enable the Alt+F shortcut' }).locator('input').uncheck();
  await page.click('.settings-panel__close');
  await page.keyboard.press('Alt+n');
  await page.keyboard.press('Alt+f');
  await expect(page.locator('.fcard')).toHaveCount(0);
});
