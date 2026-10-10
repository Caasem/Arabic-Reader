import { test, expect, type Page } from '@playwright/test';
import { makePdf } from '../src/pdf/testPdf';

/**
 * Piles in the quiet reader's margins (src/studyDesk/piles.ts, MarginLayer.tsx, PileFan.tsx): rest a dragged card
 * on another to pile it, drop sooner to move it; the fan, unpiling, naming, the lasso and Undo.
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

async function lineY(page: Page, paragraph: number) {
  return page.evaluate((n) => {
    const ps = Array.from(document.querySelectorAll('.qr-chapter p')).filter((p) => p.querySelector('.ar-word'));
    const r = ps[Math.min(n, ps.length - 1)].querySelector('.ar-word')!.getBoundingClientRect();
    return r.top + r.height / 2;
  }, paragraph);
}

/** Three margin notes in the right margin, beside the first three paragraphs. */
async function threeNotes(page: Page) {
  await openSample(page);
  const area = page.locator('.sd-margins__area').last();
  await expect(area).toBeVisible();
  const box = (await area.boundingBox())!;
  for (const [i, text] of ['First note', 'Second note', 'Third note'].entries()) {
    await page.mouse.dblclick(box.x + box.width / 2, await lineY(page, i));
    await expect(page.getByRole('textbox', { name: 'Margin note' }).last()).toBeFocused();
    await page.keyboard.type(text);
    await page.keyboard.press('Escape');
  }
  await expect(page.locator('.sd-margins > .sd-gloss')).toHaveCount(3);
}

/** The centre of the card whose note says `text`. */
async function centreOf(page: Page, text: string) {
  return page.evaluate((t) => {
    const el = Array.from(document.querySelectorAll<HTMLElement>('.sd-margins > .sd-gloss, .sd-fan .sd-gloss')).find((g) => g.querySelector('textarea')?.value === t);
    const r = el!.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + Math.min(r.height / 2, 18) };
  }, text);
}

/** Drags one card onto another and rests there `hold` ms before letting go. */
async function dragOnto(page: Page, from: string, onto: string, hold: number) {
  const a = await centreOf(page, from);
  const b = await centreOf(page, onto);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(a.x + 10, a.y + 10, { steps: 2 });
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.waitForTimeout(hold);
  await page.mouse.up();
}

test.describe('piles in the margins', () => {
  test('resting on a card piles it underneath; dropping sooner moves it; Undo takes the pile apart', async ({ page }) => {
    await threeNotes(page);
    // Quick drop: a move, no pile.
    await dragOnto(page, 'Third note', 'Second note', 60);
    await expect(page.locator('.sd-gloss--pile')).toHaveCount(0);
    await expect(page.locator('.sd-margins > .sd-gloss')).toHaveCount(3);

    // Resting ~300ms: a pile, the target on top.
    await dragOnto(page, 'First note', 'Second note', 500);
    const pile = page.locator('.sd-margins > .sd-gloss--pile');
    await expect(pile).toHaveCount(1);
    await expect(pile.locator('.sd-pile__count')).toHaveText('2');
    await expect(pile.locator('textarea')).toHaveValue('Second note');
    await expect(page.locator('.sd-margins > .sd-gloss')).toHaveCount(2);
    await expect(page.locator('.sd-toast')).toContainText('Piled');

    // Onto the pile: to the bottom of it.
    await page.mouse.move(10, 10);
    await dragOnto(page, 'Third note', 'Second note', 500);
    await expect(pile.locator('.sd-pile__count')).toHaveText('3');

    await page.locator('.sd-toast').getByRole('button', { name: /Undo/ }).click();
    await expect(page.locator('.sd-toast')).toContainText('Undone');
    await expect(pile.locator('.sd-pile__count')).toHaveText('2');
  });

  test('hover fans the pile out beside the text; click keeps it, Esc closes; dragging a card out dissolves a pile of two', async ({ page }) => {
    await threeNotes(page);
    await dragOnto(page, 'First note', 'Second note', 500);
    const pile = page.locator('.sd-margins > .sd-gloss--pile');
    await expect(pile).toHaveCount(1);
    await page.mouse.move(10, 10);

    const c = await centreOf(page, 'Second note');
    await page.mouse.move(c.x, c.y);
    const fan = page.locator('.sd-fan');
    await expect(fan).toBeVisible();
    await expect(fan.locator('.sd-gloss')).toHaveCount(2);
    const [f, col] = await Promise.all([fan.boundingBox(), page.locator('.qr-column').boundingBox()]);
    expect(f!.x).toBeGreaterThanOrEqual(col!.x + col!.width);

    // Leaving folds it; a click keeps it open; Esc closes.
    await page.mouse.move(10, 10);
    await expect(fan).toHaveCount(0);
    await page.mouse.move(c.x, c.y);
    await expect(fan).toBeVisible();
    await fan.locator('.sd-fan__head').click();
    await page.mouse.move(10, 10);
    await page.waitForTimeout(400);
    await expect(fan).toHaveClass(/sd-fan--pinned/);
    await page.keyboard.press('Escape');
    await expect(fan).toHaveCount(0);

    // Drag a card out of the fan into empty margin: off the pile, and a pile of one is no pile.
    await page.mouse.move(c.x, c.y);
    await expect(fan).toBeVisible();
    const m = await centreOf(page, 'First note');
    // Out to the other margin (dropping inside the fan would put it back).
    const left = (await page.locator('.sd-margins__area').first().boundingBox())!;
    await page.mouse.move(m.x, m.y);
    await page.mouse.down();
    await page.mouse.move(m.x + 10, m.y + 10, { steps: 2 });
    await page.mouse.move(left.x + left.width / 2, await lineY(page, 3), { steps: 8 });
    await page.mouse.up();
    await expect(page.locator('.sd-toast')).toContainText('a pile of one dissolves');
    await expect(page.locator('.sd-gloss--pile')).toHaveCount(0);
    await expect(page.locator('.sd-margins > .sd-gloss')).toHaveCount(3);
  });

  test('double-click names a pile and gives it a colour tab', async ({ page }) => {
    await threeNotes(page);
    await dragOnto(page, 'First note', 'Second note', 500);
    await page.mouse.move(10, 10);
    await page.locator('.sd-margins > .sd-gloss--pile .sd-pile__count').click();
    const fan = page.locator('.sd-fan');
    await fan.locator('.sd-fan__name').dblclick();
    await page.getByRole('textbox', { name: 'Pile name' }).fill('Habit and skill');
    await fan.getByRole('button', { name: 'Blue' }).click();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Escape');
    const tab = page.locator('.sd-margins > .sd-gloss--pile .sd-pile__tab');
    await expect(tab).toHaveText('Habit and skill');
    await expect(tab).toHaveCSS('background-color', 'rgb(74, 111, 150)');
  });

  test('lasso then P piles the chosen cards; Delete deletes them, with Undo', async ({ page }) => {
    await threeNotes(page);
    const area = (await page.locator('.sd-margins__area').last().boundingBox())!;
    const [y0, y2] = [await lineY(page, 0), await lineY(page, 2)];
    // From empty margin below the third note up past the first.
    await page.mouse.move(area.x + 6, y2 + 70);
    await page.mouse.down();
    await page.mouse.move(area.x + area.width - 6, y0 - 12, { steps: 8 });
    await page.mouse.up();
    await expect(page.locator('.sd-selbar')).toContainText('3 chosen');
    await page.keyboard.press('p');
    const pile = page.locator('.sd-margins > .sd-gloss--pile');
    await expect(pile.locator('.sd-pile__count')).toHaveText('3');
    await expect(pile.locator('textarea')).toHaveValue('First note');

    await pile.click({ position: { x: 4, y: 4 }, modifiers: ['Shift'] });
    await expect(page.locator('.sd-selbar')).toContainText('1 chosen');
    await page.keyboard.press('Delete');
    await expect(page.locator('.sd-margins > .sd-gloss')).toHaveCount(0);
    await expect(page.locator('.sd-toast')).toContainText('Deleted 3 cards');
    await page.keyboard.press('Control+z');
    await expect(page.locator('.sd-margins > .sd-gloss--pile .sd-pile__count')).toHaveText('3');
  });
});

test.describe('piles beside PDF pages', () => {
  /** Three margin notes in the strip beside page 1 of a scanned PDF. */
  async function threePdfNotes(page: Page) {
    await page.goto('/');
    await page.waitForSelector('.navbar__settings', { timeout: 15000 });
    await page.setInputFiles('.library__actions input[type=file]', { name: 'scan.pdf', mimeType: 'application/pdf', buffer: Buffer.from(makePdf([{ image: true }, { image: true }])) });
    await expect(page.locator('.book-card')).toHaveCount(1, { timeout: 30000 });
    await page.locator('.book-card__open').first().click();
    await expect(page.locator('.reader__footer')).toContainText('Page 1 of 2', { timeout: 20000 });
    const area = page.locator('.sd-pdfmargin__area');
    await expect(area).toBeVisible();
    const a = (await area.boundingBox())!;
    const frame = (await page.locator('.pdfp-page[data-page="1"]').boundingBox())!;
    for (const [i, text] of ['First note', 'Second note', 'Third note'].entries()) {
      await page.mouse.dblclick(a.x + a.width / 2, frame.y + 120 + i * 140);
      await expect(page.getByRole('textbox', { name: 'Margin note' }).last()).toBeFocused();
      await page.keyboard.type(text);
      await page.keyboard.press('Escape');
    }
    await expect(page.locator('.sd-pdfmargin > .sd-gloss')).toHaveCount(3);
  }
  async function centreOfPdf(page: Page, text: string) {
    return page.evaluate((t) => {
      const el = Array.from(document.querySelectorAll<HTMLElement>('.sd-pdfmargin > .sd-gloss, .sd-fan .sd-gloss')).find((g) => g.querySelector('textarea')?.value === t);
      const r = el!.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + Math.min(r.height / 2, 18) };
    }, text);
  }
  async function dragOntoPdf(page: Page, from: string, onto: string, hold: number) {
    const a = await centreOfPdf(page, from);
    const b = await centreOfPdf(page, onto);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(a.x + 10, a.y + 10, { steps: 2 });
    await page.mouse.move(b.x, b.y, { steps: 8 });
    await page.waitForTimeout(hold);
    await page.mouse.up();
  }

  test('resting on a card piles it; the pile fans out in the strip; a card dragged out comes off; Undo', async ({ page }) => {
    await threePdfNotes(page);
    await dragOntoPdf(page, 'First note', 'Second note', 500);
    const pile = page.locator('.sd-pdfmargin > .sd-gloss--pile');
    await expect(pile).toHaveCount(1);
    await expect(pile.locator('.sd-pile__count')).toHaveText('2');
    await expect(page.locator('.sd-pdfmargin > .sd-gloss')).toHaveCount(2);
    await expect(page.locator('.sd-toast')).toContainText('Piled');

    // The fan opens inside the strip beside the pages.
    await pile.locator('.sd-pile__count').click();
    const fan = page.locator('.sd-fan');
    await expect(fan).toBeVisible();
    const strip = (await page.locator('.sd-pdfmargin__area').boundingBox())!;
    const f = (await fan.boundingBox())!;
    expect(f.x).toBeGreaterThanOrEqual(strip.x - 1);
    await page.keyboard.press('Escape');
    await expect(fan).toHaveCount(0);

    // Undo takes the pile apart.
    await page.mouse.move(10, 10);
    await dragOntoPdf(page, 'Third note', 'Second note', 500);
    await expect(pile.locator('.sd-pile__count')).toHaveText('3');
    await page.locator('.sd-toast').getByRole('button', { name: /Undo/ }).click();
    await expect(pile.locator('.sd-pile__count')).toHaveText('2');
  });

  test('a quick drop moves a note to that height of the page', async ({ page }) => {
    await threePdfNotes(page);
    const before = (await page.locator('.sd-pdfmargin > .sd-gloss', { has: page.locator('textarea') }).first().boundingBox())!.y;
    const a = await centreOfPdf(page, 'First note');
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(a.x, a.y + 10, { steps: 2 });
    await page.mouse.move(a.x, a.y + 320, { steps: 8 });
    await page.mouse.up();
    await expect(page.locator('.sd-gloss--pile')).toHaveCount(0);
    await expect.poll(async () => (await centreOfPdf(page, 'First note')).y).toBeGreaterThan(before + 200);
  });
});
