import { chromium } from 'playwright';

const log = (...args) => console.log('[touch-gestures-e2e]', ...args);
const BASE_URL = process.env.BASE_URL || 'http://localhost:4173/';

/** Dispatches a real touch tap (or, with `holdMs`, a long-press) at the
 * center of the `.ar-word` locator at `wordIndex` inside the reader's epub
 * iframe.
 *
 * This drives touch input through the DevTools Protocol's `Input` domain
 * (via a raw CDPSession) rather than in-page `element.dispatchEvent(new
 * TouchEvent(...))`. That distinction matters a lot here: a script-
 * dispatched TouchEvent is untrusted, and this app's epub content renders
 * inside a sandboxed iframe (`about:srcdoc`) whose scripting permissions
 * epub.js escalates progressively as it boots the view. An untrusted touch
 * landed on that iframe mid-boot was observed to leave the iframe's script
 * execution wedged — `about:srcdoc` stuck logging "Blocked script
 * execution ... sandboxed" and `frame.evaluate` never resolving, eventually
 * failing with "Execution context was destroyed" tens of seconds later.
 * CDP-injected touch input is trusted the same way a real finger on a real
 * touchscreen is, and doesn't hit that path — confirmed by first
 * reproducing the hang with `dispatchEvent`, then confirming a plain
 * `page.touchscreen.tap()` at the same coordinates works instantly. This
 * helper only adds the manual touchStart/touchEnd split (with a delay in
 * between) that `page.touchscreen.tap()` itself doesn't expose, which the
 * Hold-gesture test below needs. */
async function touchWord(page, frame, client, wordIndex, { holdMs = 0 } = {}) {
  const locator = frame.locator('.ar-word').nth(wordIndex);
  const word = await locator.getAttribute('data-word');
  const box = await locator.boundingBox();
  if (!box) throw new Error(`touchWord: no bounding box for .ar-word[${wordIndex}]`);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;

  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x, y, id: 1 }],
  });
  if (holdMs > 0) await new Promise((r) => setTimeout(r, holdMs));
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
  return word;
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  // hasTouch/isMobile so the app's touch-gesture code path (which only
  // attaches its touchstart/touchmove/touchend listeners believing it's on
  // a touch-capable device) is actually exercised, matching a real phone.
  const context = await browser.newContext({ viewport: { width: 420, height: 860 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  const client = await context.newCDPSession(page);
  page.on('pageerror', (err) => log('page error:', err.message));

  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.waitForSelector('.navbar__settings', { timeout: 10000 });

  // --- Confirm the default gesture bindings in Settings ---
  await page.click('.navbar__settings');
  await page.waitForSelector('.settings-panel', { timeout: 5000 });
  await page.locator('.settings-section', { hasText: 'Touch gestures' }).scrollIntoViewIfNeeded();
  const selects = page.locator('.settings-row__select');
  const [singleTapDefault, doubleTapDefault, holdDefault] = await Promise.all([
    selects.nth(0).inputValue(),
    selects.nth(1).inputValue(),
    selects.nth(2).inputValue(),
  ]);
  log('default bindings:', { singleTapDefault, doubleTapDefault, holdDefault });
  if (singleTapDefault !== 'bubble') throw new Error(`Expected default Single tap = bubble, got ${singleTapDefault}`);
  if (doubleTapDefault !== 'quickSave') throw new Error(`Expected default Double tap = quickSave, got ${doubleTapDefault}`);
  if (holdDefault !== 'none') throw new Error(`Expected default Hold = none, got ${holdDefault}`);
  await page.click('.settings-panel__close');

  // --- Open sample book ---
  await page.locator('.navbar__item', { hasText: 'Library' }).click();
  await page.waitForSelector('text=Try the sample book', { timeout: 10000 });
  await page.click('text=Try the sample book');
  await page.waitForSelector('.book-card', { timeout: 15000 });
  await page.click('.book-card');
  await page.waitForSelector('.reader__epub iframe', { timeout: 15000 });
  await page.waitForTimeout(1500);

  const frame = page.frames().find((f) => f !== page.mainFrame());
  const wordCount = await frame.locator('.ar-word').count();
  if (wordCount < 8) throw new Error(`Expected at least 8 distinct word spans in the sample section, got ${wordCount}`);

  // --- Single tap (default: bubble) ---
  const word0 = await touchWord(page, frame, client, 0);
  await page.waitForSelector('.dict-bubble', { timeout: 8000 });
  await page.waitForTimeout(500);
  const bubbleWordText = await page.locator('.dict-bubble__word').textContent();
  log('single tap opened bubble for:', word0, '| bubble shows:', bubbleWordText);
  if (await page.locator('.dict-popup').count()) throw new Error('Single tap (bubble) should not also open the full popup');

  // Tap "+" in the bubble — should save immediately, no confirmation dialog.
  await page.click('.dict-bubble__save');
  await page.waitForTimeout(200);
  const saveBtnClass = await page.locator('.dict-bubble__save').getAttribute('class');
  log('bubble save button class after tapping +:', saveBtnClass);
  if (!saveBtnClass.includes('dict-bubble__save--saved')) throw new Error('Expected the bubble\'s + button to flip to saved state');

  // Tapping the definition area opens the full popup.
  await page.click('.dict-bubble__def');
  await page.waitForSelector('.dict-popup', { timeout: 5000 });
  log('tapping the bubble definition opened the full popup');
  await page.click('.dict-popup__close');
  await page.waitForTimeout(200);

  // --- Double tap (default: quickSave) on a different word ---
  const word2a = await touchWord(page, frame, client, 2);
  await page.waitForTimeout(120); // well under the 350ms double-tap window
  const word2b = await touchWord(page, frame, client, 2);
  await page.waitForSelector('.reader__touch-toast', { timeout: 8000 });
  const toastText = await page.locator('.reader__touch-toast span').first().textContent();
  log('double tap on', word2a, word2b, '-> toast:', toastText);
  if (!toastText.includes('Saved')) throw new Error(`Expected a "Saved" toast after double tap, got: ${toastText}`);
  await page.waitForTimeout(3200); // let the toast auto-dismiss so it doesn't linger over later steps

  // --- Enable Hold -> quick-save, then long-press a third word ---
  await page.click('.navbar__settings');
  await page.waitForSelector('.settings-panel', { timeout: 5000 });
  await page.locator('.settings-row__select').nth(2).selectOption('quickSave');
  await page.click('.settings-panel__close');
  await page.waitForTimeout(200);

  const word4 = await touchWord(page, frame, client, 4, { holdMs: 650 }); // > TOUCH_HOLD_MS (500ms)
  await page.waitForSelector('.reader__touch-toast', { timeout: 8000 });
  const holdToastText = await page.locator('.reader__touch-toast span').first().textContent();
  log('hold (long-press) on', word4, '-> toast:', holdToastText);
  if (!holdToastText.includes('Saved') && !holdToastText.includes('already')) {
    throw new Error(`Expected a save-related toast after Hold, got: ${holdToastText}`);
  }
  if (await page.locator('.dict-bubble').count()) throw new Error('Hold bound to quickSave should not open the bubble');
  await page.waitForTimeout(3200);

  // --- Turn Single tap off -> falls back to the native click -> full popup ---
  await page.click('.navbar__settings');
  await page.waitForSelector('.settings-panel', { timeout: 5000 });
  await page.locator('.settings-row__select').nth(0).selectOption('none');
  await page.locator('.settings-row__select').nth(1).selectOption('none');
  await page.click('.settings-panel__close');
  await page.waitForTimeout(200);

  await touchWord(page, frame, client, 6);
  await page.waitForSelector('.dict-popup', { timeout: 8000 });
  log('with gestures off, a tap fell back to the full popup as before this feature existed');
  await page.click('.dict-popup__close');

  // --- Backup export/import controls are also present on Vocabulary and Review tabs ---
  await page.locator('.navbar__item', { hasText: 'Vocabulary' }).click();
  await page.waitForSelector('.vocab', { timeout: 8000 });
  const vocabHasExport = (await page.locator('.vocab .backup-controls').locator('text=Export backup').count()) > 0;
  log('Vocabulary tab has backup export/import controls:', vocabHasExport);
  if (!vocabHasExport) throw new Error('Expected export/import backup controls on the Vocabulary tab');

  await page.locator('.navbar__item', { hasText: 'Review' }).click();
  await page.waitForSelector('.review', { timeout: 8000 });
  // `.review` matches during the brief queue-loading state too (which
  // renders no BackupControls yet) -- wait for that to resolve into
  // either the empty or the active-card state before checking.
  await page.waitForSelector('.review__empty, .review__card', { timeout: 8000 });
  const reviewHasExport = (await page.locator('.review .backup-controls').locator('text=Export backup').count()) > 0;
  log('Review tab has backup export/import controls:', reviewHasExport);
  if (!reviewHasExport) throw new Error('Expected export/import backup controls on the Review tab');

  log('ALL TOUCH GESTURE CHECKS PASSED');
  await browser.close();
})().catch(async (err) => {
  console.error('[touch-gestures-e2e] FAILED:', err);
  process.exit(1);
});
