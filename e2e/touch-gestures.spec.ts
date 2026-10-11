import { test, expect, type Page, type CDPSession } from '@playwright/test';

/**
 * Touch gestures in the new reader, at a phone viewport, with the bindings the
 * Phone profile sets up (src/onboarding/deviceProfile.ts): a tap opens the
 * dictionary, a double tap quick-saves.
 */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const key = 'arabic-reader:preferences';
    if (!localStorage.getItem(key)) {
      localStorage.setItem(key, JSON.stringify({ touchGestures: { singleTap: 'openDictionary', doubleTap: 'quickSave', hold: 'none' } }));
    }
  });
});

/**
 * Dispatches a real touch tap (or, with `holdMs`, a long-press) via the
 * DevTools Protocol's `Input` domain rather than an in-page dispatchEvent:
 * CDP-injected touch input is trusted the same way a real finger on a real
 * touchscreen is, and goes through the browser's own tap and click handling.
 */
async function touchWord(page: Page, client: CDPSession, wordIndex: number, { holdMs = 0 } = {}) {
  const locator = page.locator('.qr-chapter .ar-word').nth(wordIndex);
  const word = await locator.getAttribute('data-word');
  const box = await locator.boundingBox();
  if (!box) throw new Error(`touchWord: no bounding box for .ar-word[${wordIndex}]`);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;

  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
  if (holdMs > 0) await new Promise((r) => setTimeout(r, holdMs));
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  return word;
}

test.use({ viewport: { width: 420, height: 860 }, hasTouch: true, isMobile: true });

test('phone touch-gesture bindings, single/double-tap/hold behavior, and the no-gestures fallback', async ({
  page,
  context,
}: {
  page: Page;
  context: import('@playwright/test').BrowserContext;
}) => {
  const client = await context.newCDPSession(page);

  await page.goto('/');
  await page.waitForSelector('.navbar__settings', { timeout: 10000 });

  await page.click('.navbar__settings');
  await page.waitForSelector('.settings-panel', { timeout: 5000 });
  await page.locator('.settings-section', { hasText: 'Touch gestures' }).scrollIntoViewIfNeeded();
  const selects = page.locator('.settings-row__select');
  const [singleTapDefault, doubleTapDefault, holdDefault] = await Promise.all([
    selects.nth(0).inputValue(),
    selects.nth(1).inputValue(),
    selects.nth(2).inputValue(),
  ]);
  expect(singleTapDefault).toBe('openDictionary');
  expect(doubleTapDefault).toBe('quickSave');
  expect(holdDefault).toBe('none');
  await page.click('.settings-panel__close');

  await page.locator('.navbar__item', { hasText: 'Library' }).click();
  await page.waitForSelector('text=Try the sample book', { timeout: 10000 });
  await page.click('text=Try the sample book');
  await page.waitForSelector('.book-card', { timeout: 15000 });
  await page.click('.book-card');
  await page.waitForSelector('.qr-chapter .ar-word', { timeout: 15000 });
  await page.waitForTimeout(500);

  const wordCount = await page.locator('.qr-chapter .ar-word').count();
  expect(wordCount, 'expected at least 8 distinct word spans in the sample section').toBeGreaterThanOrEqual(8);

  // --- Single tap (phone: openDictionary) ---
  await touchWord(page, client, 0);
  await page.waitForSelector('.dict-popup', { timeout: 8000 });
  await expect(page.locator('.dict-bubble')).toHaveCount(0);
  await page.click('.dict-popup__close');
  await page.waitForTimeout(200);

  // --- Double tap (phone: quickSave) ---
  await touchWord(page, client, 2);
  await page.waitForTimeout(120); // well under the 350ms double-tap window
  await touchWord(page, client, 2);
  await page.waitForSelector('.reader__touch-toast', { timeout: 8000 });
  const toastText = await page.locator('.reader__touch-toast span').first().textContent();
  expect(toastText).toContain('Saved');
  await expect(page.locator('.dict-popup')).toHaveCount(0); // the first tap's popup closed with the double tap
  await expect(page.locator('.reader__touch-toast')).toHaveCount(0); // waits out its own auto-dismiss timer

  // --- Hold -> quickSave ---
  await page.click('.navbar__settings');
  await page.waitForSelector('.settings-panel', { timeout: 5000 });
  await page.locator('.settings-row__select').nth(2).selectOption('quickSave');
  await page.click('.settings-panel__close');
  await page.waitForTimeout(200);

  await touchWord(page, client, 4, { holdMs: 650 }); // > TOUCH_HOLD_MS (500ms)
  await page.waitForSelector('.reader__touch-toast', { timeout: 8000 });
  const holdToastText = await page.locator('.reader__touch-toast span').first().textContent();
  expect(holdToastText?.includes('Saved') || holdToastText?.includes('already')).toBe(true);
  await expect(page.locator('.dict-bubble')).toHaveCount(0);
  await expect(page.locator('.reader__touch-toast')).toHaveCount(0); // waits out its own auto-dismiss timer

  // --- Single tap -> bubble (the default off phones) ---
  await page.click('.navbar__settings');
  await page.waitForSelector('.settings-panel', { timeout: 5000 });
  await page.locator('.settings-row__select').nth(0).selectOption('bubble');
  await page.click('.settings-panel__close');
  await page.waitForTimeout(200);

  await touchWord(page, client, 5);
  await page.waitForSelector('.dict-bubble', { timeout: 8000 });
  await expect(page.locator('.dict-popup')).toHaveCount(0);
  await page.click('.dict-bubble__def');
  await page.waitForSelector('.dict-popup', { timeout: 5000 });
  await page.click('.dict-popup__close');
  await page.waitForTimeout(200);

  // --- Gestures off -> falls back to the native click -> full popup ---
  await page.click('.navbar__settings');
  await page.waitForSelector('.settings-panel', { timeout: 5000 });
  await page.locator('.settings-row__select').nth(0).selectOption('none');
  await page.locator('.settings-row__select').nth(1).selectOption('none');
  await page.click('.settings-panel__close');
  await page.waitForTimeout(200);

  await touchWord(page, client, 6);
  await page.waitForSelector('.dict-popup', { timeout: 8000 });
  await page.click('.dict-popup__close');

  // --- Backup controls also present on Vocabulary and Review tabs ---
  await page.locator('.navbar__item', { hasText: 'Vocabulary' }).click();
  await page.waitForSelector('.vocab', { timeout: 8000 });
  await expect(page.locator('.vocab .backup-controls').getByText('Export backup')).toHaveCount(1);

  await page.locator('.navbar__item', { hasText: 'Review' }).click();
  await page.waitForSelector('.review__empty, .review__card', { timeout: 8000 });
  await expect(page.locator('.review .backup-controls').getByText('Export backup')).toHaveCount(1);
});
