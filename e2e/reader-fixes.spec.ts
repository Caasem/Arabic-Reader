import { test, expect, type Page } from '@playwright/test';

/** Regressions in the new reader (src/quietReader): the hover bubble, double-click save, the popup's Save button, page turns. */
test.use({ viewport: { width: 1440, height: 900 } });

async function openSample(page: Page) {
  await page.addInitScript(() => {
    if (!localStorage.getItem('arabic-reader:preferences')) localStorage.setItem('arabic-reader:preferences', JSON.stringify({ hoverPreviewEnabled: true }));
  });
  await page.goto('/');
  await page.waitForSelector('.navbar__settings', { timeout: 15000 });
  await page.locator('.navbar__item', { hasText: 'Library' }).click();
  await page.waitForSelector('text=Try the sample book', { timeout: 10000 });
  if ((await page.locator('.book-card').count()) === 0) await page.click('text=Try the sample book');
  await page.locator('.book-card').first().click();
  await page.waitForSelector('.qr-chapter .ar-word', { timeout: 15000 });
}

test('the hover bubble sits centred above its word, even beside the sidebar', async ({ page }) => {
  await openSample(page);
  const word = page.locator('.qr-chapter .ar-word').nth(3);
  await word.hover();
  const bubble = page.locator('.hover-preview');
  await expect(bubble).toBeVisible({ timeout: 8000 });
  const w = (await word.boundingBox())!;
  const b = (await bubble.boundingBox())!;
  expect(Math.abs(b.x + b.width / 2 - (w.x + w.width / 2))).toBeLessThan(6);
  expect(b.y + b.height).toBeLessThanOrEqual(w.y + 1);
});

test('double-clicking a word saves it', async ({ page }) => {
  await openSample(page);
  const word = page.locator('.qr-chapter .ar-word').nth(4);
  await expect(word).not.toHaveClass(/ar-word--saved/);
  await word.dblclick();
  await expect(word).toHaveClass(/ar-word--saved/);
  await expect(page.locator('.reader__quick-add-toast')).toContainText('Saved');
});

test('the popup Save Vocabulary button shows its label on a dark button', async ({ page }) => {
  await openSample(page);
  await page.locator('.qr-chapter .ar-word').nth(6).click();
  const save = page.locator('.dict-popup__save');
  await expect(save).toHaveText('Save Vocabulary');
  const [color, background] = await save.evaluate((el) => {
    const s = getComputedStyle(el);
    return [s.color, s.backgroundColor];
  });
  expect(color).not.toBe(background);
});

test('page turns keep the text inside its frame', async ({ page }) => {
  await openSample(page);
  for (let turn = 0; turn < 6; turn++) {
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(250);
  }
  const straddling = await page.evaluate(() => {
    const col = document.querySelector('.qr-column')!.getBoundingClientRect();
    return [...document.querySelectorAll('.qr-text .ar-word')].filter((el) => {
      const r = el.getBoundingClientRect();
      if (r.top < col.top || r.bottom > col.bottom) return false;
      return (r.left < col.right - 2 && r.right > col.right + 2) || (r.left < col.left - 2 && r.right > col.left + 2);
    }).length;
  });
  expect(straddling).toBe(0);
});
