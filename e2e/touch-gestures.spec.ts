import { test, expect, type Page, type Frame, type CDPSession } from '@playwright/test';

/**
 * Dispatches a real touch tap (or, with `holdMs`, a long-press) via the
 * DevTools Protocol's `Input` domain rather than an in-page dispatchEvent.
 * That distinction matters here: a script-dispatched TouchEvent is
 * untrusted, and this app's epub content renders inside a sandboxed iframe
 * (`about:srcdoc`) whose scripting permissions epub.js escalates
 * progressively as it boots the view -- an untrusted touch landed on that
 * iframe mid-boot was observed to leave its script execution wedged
 * ("Blocked script execution ... sandboxed", `frame.evaluate` never
 * resolving). CDP-injected touch input is trusted the same way a real
 * finger on a real touchscreen is, and doesn't hit that path.
 */
async function touchWord(frame: Frame, client: CDPSession, wordIndex: number, { holdMs = 0 } = {}) {
  const locator = frame.locator('.ar-word').nth(wordIndex);
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

test('default touch-gesture bindings, single/double-tap/hold behavior, and the no-gestures fallback', async ({
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
  expect(singleTapDefault).toBe('bubble');
  expect(doubleTapDefault).toBe('quickSave');
  expect(holdDefault).toBe('none');
  await page.click('.settings-panel__close');

  await page.locator('.navbar__item', { hasText: 'Library' }).click();
  await page.waitForSelector('text=Try the sample book', { timeout: 10000 });
  await page.click('text=Try the sample book');
  await page.waitForSelector('.book-card', { timeout: 15000 });
  await page.click('.book-card');
  await page.waitForSelector('.reader__epub iframe', { timeout: 15000 });
  await page.waitForTimeout(1500);

  const frame = page.frames().find((f) => f !== page.mainFrame())!;
  const wordCount = await frame.locator('.ar-word').count();
  expect(wordCount, 'expected at least 8 distinct word spans in the sample section').toBeGreaterThanOrEqual(8);

  // --- Single tap (default: bubble) ---
  await touchWord(frame, client, 0);
  await page.waitForSelector('.dict-bubble', { timeout: 8000 });
  await page.waitForTimeout(500);
  await expect(page.locator('.dict-popup')).toHaveCount(0);

  await page.click('.dict-bubble__save');
  await page.waitForTimeout(200);
  await expect(page.locator('.dict-bubble__save')).toHaveClass(/dict-bubble__save--saved/);

  await page.click('.dict-bubble__def');
  await page.waitForSelector('.dict-popup', { timeout: 5000 });
  await page.click('.dict-popup__close');
  await page.waitForTimeout(200);

  // --- Double tap (default: quickSave) ---
  await touchWord(frame, client, 2);
  await page.waitForTimeout(120); // well under the 350ms double-tap window
  await touchWord(frame, client, 2);
  await page.waitForSelector('.reader__touch-toast', { timeout: 8000 });
  const toastText = await page.locator('.reader__touch-toast span').first().textContent();
  expect(toastText).toContain('Saved');
  await page.waitForTimeout(3200); // let the toast auto-dismiss

  // --- Hold -> quickSave ---
  await page.click('.navbar__settings');
  await page.waitForSelector('.settings-panel', { timeout: 5000 });
  await page.locator('.settings-row__select').nth(2).selectOption('quickSave');
  await page.click('.settings-panel__close');
  await page.waitForTimeout(200);

  await touchWord(frame, client, 4, { holdMs: 650 }); // > TOUCH_HOLD_MS (500ms)
  await page.waitForSelector('.reader__touch-toast', { timeout: 8000 });
  const holdToastText = await page.locator('.reader__touch-toast span').first().textContent();
  expect(holdToastText?.includes('Saved') || holdToastText?.includes('already')).toBe(true);
  await expect(page.locator('.dict-bubble')).toHaveCount(0);
  await page.waitForTimeout(3200);

  // --- Gestures off -> falls back to the native click -> full popup ---
  await page.click('.navbar__settings');
  await page.waitForSelector('.settings-panel', { timeout: 5000 });
  await page.locator('.settings-row__select').nth(0).selectOption('none');
  await page.locator('.settings-row__select').nth(1).selectOption('none');
  await page.click('.settings-panel__close');
  await page.waitForTimeout(200);

  await touchWord(frame, client, 6);
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
