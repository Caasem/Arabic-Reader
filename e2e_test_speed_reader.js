import { chromium } from 'playwright';

const log = (...args) => console.log('[speed-reader-e2e]', ...args);
const BASE_URL = process.env.BASE_URL || 'http://localhost:4173/';

function parseWordIndex(label) {
  // "1,248 / 8,532 words · 14.6%" -> 1248 (0-based word index shown is 1-based, so subtract 1)
  const m = label.replace(/,/g, '').match(/(\d+)\s*\/\s*(\d+)/);
  if (!m) return null;
  return { current: Number(m[1]), total: Number(m[2]) };
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('pageerror', (err) => log('page error:', err.message));

  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.waitForSelector('.navbar__settings', { timeout: 10000 });

  // --- Get a book into the library first (Speed Reader picks from the same library) ---
  await page.locator('.navbar__item', { hasText: 'Library' }).click();
  await page.waitForSelector('text=Try the sample book', { timeout: 10000 });
  await page.click('text=Try the sample book');
  await page.waitForSelector('.book-card', { timeout: 15000 });

  // --- Open the Speed Reader nav tab and pick the book ---
  await page.locator('.navbar__item', { hasText: 'Speed Reader' }).click();
  await page.waitForSelector('.speed-reader-book', { timeout: 8000 });
  await page.click('.speed-reader-book');
  await page.waitForSelector('.speed-reader-picker__start', { timeout: 10000 });
  log('setup screen: book selected, chapter picker shown');

  // --- Enter Fullscreen Focus Mode ---
  await page.click('.speed-reader-picker__start');
  await page.waitForSelector('.rsvp-word', { timeout: 8000 });
  await page.waitForTimeout(300);
  log('entered Focus Mode, RSVP word visible');

  // --- Play/Pause via Space advances the word index ---
  const labelBefore = await page.locator('.rsvp-progress__label').textContent();
  await page.keyboard.press('Space'); // play
  await page.waitForTimeout(1200);
  await page.keyboard.press('Space'); // pause
  await page.waitForTimeout(200);
  const labelAfterPlay = await page.locator('.rsvp-progress__label').textContent();
  const before = parseWordIndex(labelBefore);
  const afterPlay = parseWordIndex(labelAfterPlay);
  log('word index before/after 1.2s of playback:', before?.current, '->', afterPlay?.current);
  if (!(afterPlay.current > before.current)) {
    throw new Error(`Expected playback to advance the word index (before=${before.current}, after=${afterPlay.current})`);
  }

  // --- ArrowUp increases WPM immediately ---
  const wpmBefore = Number((await page.locator('.rsvp-wpm__value').textContent()).match(/\d+/)[0]);
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(150);
  const wpmAfter = Number((await page.locator('.rsvp-wpm__value').textContent()).match(/\d+/)[0]);
  log('WPM before/after 2x ArrowUp:', wpmBefore, '->', wpmAfter);
  if (wpmAfter !== wpmBefore + 50) throw new Error(`Expected WPM to increase by 50, got ${wpmBefore} -> ${wpmAfter}`);

  // --- Previous/Next word buttons move exactly one word ---
  const beforeNext = parseWordIndex(await page.locator('.rsvp-progress__label').textContent());
  await page.click('[aria-label="Next word"]');
  const afterNext = parseWordIndex(await page.locator('.rsvp-progress__label').textContent());
  log('Next word button:', beforeNext.current, '->', afterNext.current);
  if (afterNext.current !== beforeNext.current + 1) throw new Error('Expected Next word to advance by exactly one word');
  await page.click('[aria-label="Previous word"]');
  const afterPrev = parseWordIndex(await page.locator('.rsvp-progress__label').textContent());
  if (afterPrev.current !== beforeNext.current) throw new Error('Expected Previous word to go back by exactly one word');

  // --- ORP toggle switches word rendering mode ---
  await page.click('[aria-label="Display settings"]');
  await page.waitForSelector('.rsvp-panel--settings', { timeout: 3000 });
  const orpOnClass = await page.locator('.rsvp-word').getAttribute('class');
  log('word class with ORP on:', orpOnClass);
  await page.locator('.rsvp-panel__row', { hasText: 'ORP' }).locator('.rsvp-switch').click();
  await page.waitForTimeout(150);
  const orpOffClass = await page.locator('.rsvp-word').getAttribute('class');
  log('word class with ORP off:', orpOffClass);
  if (!orpOnClass.includes('rsvp-word--orp') && orpOnClass.includes('rsvp-word--plain')) {
    log('note: current word was too short for ORP splitting even with it enabled — skipping strict ORP-class assertion');
  } else if (!orpOffClass.includes('rsvp-word--plain')) {
    throw new Error('Expected disabling ORP to switch the word to plain centered rendering');
  }

  // --- Context Mode toggle shows the surrounding sentence ---
  const contextBefore = await page.locator('.rsvp-focus__context').count();
  await page.locator('.rsvp-panel__row', { hasText: 'Show context' }).locator('.rsvp-switch').click();
  await page.waitForTimeout(150);
  const contextAfter = await page.locator('.rsvp-focus__context').count();
  log('context line present before/after toggling on:', contextBefore, '->', contextAfter);
  if (contextBefore !== 0 || contextAfter !== 1) throw new Error('Expected Context Mode toggle to show the surrounding-sentence line');
  await page.click('.rsvp-panel__close');

  // --- Dictionary lookup on the current word ---
  await page.click('.rsvp-focus__word-zone');
  await page.waitForSelector('.dict-popup', { timeout: 8000 });
  await page.waitForTimeout(400);
  const popupText = await page.locator('.dict-popup').textContent();
  log('dictionary popup text for current word:', popupText.slice(0, 120));
  if (!popupText.includes('encounter') || !popupText.includes('lookup')) {
    throw new Error('Expected the dictionary popup to show the lookup counter');
  }
  const hasAddButton = (await page.locator('.dict-popup__save').count()) > 0;
  if (!hasAddButton) throw new Error('Expected an explicit "Add to vocabulary" action, not an auto-save');
  await page.click('.dict-popup__close');

  // --- Progress bar seek jumps to a new word ---
  const track = page.locator('.rsvp-progress__track');
  const box = await track.boundingBox();
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height / 2);
  await page.waitForTimeout(200);
  const afterSeek = parseWordIndex(await page.locator('.rsvp-progress__label').textContent());
  log('word index after seeking to ~50% of the progress bar:', afterSeek.current, '/', afterSeek.total);
  const seekRatio = afterSeek.current / afterSeek.total;
  if (seekRatio < 0.3 || seekRatio > 0.7) throw new Error(`Expected seeking to the middle of the progress bar to land near 50%, got ${(seekRatio * 100).toFixed(1)}%`);

  // --- Exit Focus Mode and confirm the position was saved for resume ---
  await page.keyboard.press('Escape');
  await page.waitForSelector('.speed-reader-picker__start', { timeout: 5000 });
  await page.waitForSelector('.speed-reader-resume', { timeout: 5000 });
  const resumeText = await page.locator('.speed-reader-resume__detail').textContent();
  log('resume position shown after exiting:', resumeText);
  const resumeParsed = parseWordIndex(resumeText.replace('word', '').replace('of', '/'));
  if (!resumeParsed || Math.abs(resumeParsed.current - afterSeek.current) > 2) {
    throw new Error(`Expected the saved resume position to match where the session was exited, got: ${resumeText}`);
  }

  // --- Resume relaunches Focus Mode at the saved position ---
  await page.click('.speed-reader-resume');
  await page.waitForSelector('.rsvp-word', { timeout: 8000 });
  await page.waitForTimeout(300);
  const resumedLabel = parseWordIndex(await page.locator('.rsvp-progress__label').textContent());
  log('word index immediately after Resume:', resumedLabel.current);
  if (Math.abs(resumedLabel.current - afterSeek.current) > 2) {
    throw new Error('Expected Resume to relaunch Focus Mode at (approximately) the saved word index');
  }

  // --- Seek near the end, play at high speed, and confirm the session-complete summary appears ---
  const box2 = await page.locator('.rsvp-progress__track').boundingBox();
  await page.mouse.click(box2.x + 3, box2.y + box2.height / 2); // far left of a dir="rtl" track = near the end
  await page.waitForTimeout(150);
  await page.click('[aria-label="Display settings"]');
  await page.waitForSelector('.rsvp-panel--settings', { timeout: 3000 });
  await page.locator('.rsvp-panel__preset', { hasText: '600' }).click();
  await page.click('.rsvp-panel__close');
  await page.keyboard.press('Space'); // play
  await page.waitForSelector('.rsvp-summary', { timeout: 15000 });
  const summaryText = await page.locator('.rsvp-summary__card').textContent();
  log('session summary:', summaryText.replace(/\s+/g, ' '));
  if (!summaryText.includes('Session Complete') || !summaryText.includes('WPM')) {
    throw new Error('Expected a Session Complete summary with WPM stats');
  }
  await page.click('.rsvp-summary__actions .btn--primary');
  await page.waitForSelector('.speed-reader-picker__start', { timeout: 5000 });
  log('exited cleanly back to the Speed Reader setup screen');

  log('ALL SPEED READER CHECKS PASSED');
  await browser.close();
  process.exit(0);
})().catch((err) => {
  console.error('[speed-reader-e2e] FAILED:', err);
  process.exit(1);
});
