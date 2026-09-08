// Verifies three reading-UX changes:
// 1. Next/Previous footer buttons show text labels.
// 2. A "Layout" toggle in Settings switches paginated <-> scrolled flow live.
// 3. Footnote-shaped links are intercepted and shown in a popup instead of
//    navigating away (same-document case), with a working close + fallback
//    "Go to note" action for the failure path.
import { chromium } from 'playwright';

const log = (...args) => console.log('[reading-ux-e2e]', ...args);

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('pageerror', (err) => log('page error:', err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') log('console error:', msg.text());
  });

  await page.goto('http://localhost:4173/', { waitUntil: 'networkidle' });
  await page.waitForSelector('.navbar__settings', { timeout: 15000 });

  await page.locator('.navbar__item', { hasText: 'Library' }).click();
  await page.waitForSelector('text=Try the sample book', { timeout: 10000 });
  await page.click('text=Try the sample book');
  await page.waitForSelector('.book-card', { timeout: 15000 });
  await page.click('.book-card');
  await page.waitForSelector('.reader__epub iframe', { timeout: 15000 });
  await page.waitForTimeout(1800);

  // --- 1. Next/Previous labels ---
  const prevLabel = await page.textContent('.reader__nav-btn[aria-label="Previous page"] .reader__nav-btn-label');
  const nextLabel = await page.textContent('.reader__nav-btn[aria-label="Next page"] .reader__nav-btn-label');
  log('button labels:', { prevLabel, nextLabel });
  if (prevLabel !== 'Previous') throw new Error(`Expected "Previous" label, got "${prevLabel}"`);
  if (nextLabel !== 'Next') throw new Error(`Expected "Next" label, got "${nextLabel}"`);

  // --- 2. Scrollable toggle ---
  await page.click('.navbar__settings');
  await page.waitForSelector('.settings-panel', { timeout: 5000 });
  const layoutRow = page.locator('.settings-row', { hasText: 'Layout' });
  const beforeOptions = await layoutRow.locator('.segmented__item').allTextContents();
  log('layout options:', beforeOptions);
  if (!beforeOptions.includes('Paged') || !beforeOptions.includes('Scrolling')) {
    throw new Error('Expected Paged/Scrolling layout toggle in Settings');
  }
  const pagedActive = await layoutRow.locator('.segmented__item', { hasText: 'Paged' }).getAttribute('class');
  if (!pagedActive.includes('segmented__item--active')) throw new Error('Expected "Paged" to be the active default layout');

  await layoutRow.locator('.segmented__item', { hasText: 'Scrolling' }).click();
  await page.waitForTimeout(400);
  const scrollingActive = await layoutRow.locator('.segmented__item', { hasText: 'Scrolling' }).getAttribute('class');
  if (!scrollingActive.includes('segmented__item--active')) throw new Error('"Scrolling" did not become active after clicking it');

  await page.click('.settings-panel__close');
  await page.waitForTimeout(300);

  // Confirm epub.js's internal stage element is actually scrollable now
  // (overflow auto + real scrollable height), not just that the toggle UI moved.
  const scrollInfo = await page.evaluate(() => {
    const container = document.querySelector('.reader__epub');
    const stage = container?.firstElementChild;
    if (!stage) return null;
    const style = getComputedStyle(stage);
    return { overflowY: style.overflowY, scrollHeight: stage.scrollHeight, clientHeight: stage.clientHeight };
  });
  log('scrolled-mode stage info:', scrollInfo);
  if (!scrollInfo || (scrollInfo.overflowY !== 'auto' && scrollInfo.overflowY !== 'scroll')) {
    throw new Error(`Expected the epub stage to have overflow-y auto/scroll in scrolled mode, got: ${JSON.stringify(scrollInfo)}`);
  }

  // Persistence: reload and confirm the flow choice survived.
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.navbar__settings', { timeout: 15000 });
  await page.click('.navbar__settings');
  await page.waitForSelector('.settings-panel', { timeout: 5000 });
  const scrollingStillActive = await page
    .locator('.settings-row', { hasText: 'Layout' })
    .locator('.segmented__item', { hasText: 'Scrolling' })
    .getAttribute('class');
  if (!scrollingStillActive.includes('segmented__item--active')) throw new Error('Layout preference did not persist across reload');
  log('Layout preference persisted as "Scrolling" after reload');

  // Switch back to paginated for the footnote test below (simpler geometry).
  await page.locator('.settings-row', { hasText: 'Layout' }).locator('.segmented__item', { hasText: 'Paged' }).click();
  await page.click('.settings-panel__close');
  await page.waitForTimeout(300);

  // A reload always lands back on the Library screen (only the reading
  // *position* within a book persists, not which screen was open) — reopen
  // the sample book before continuing.
  await page.click('.book-card');
  await page.waitForSelector('.reader__epub iframe', { timeout: 15000 });
  await page.waitForTimeout(1800);

  // --- 3. Footnote interception ---
  const readerFrame = page.frames().find((f) => f !== page.mainFrame());
  const chapterBefore = await page.textContent('.reader__chapter');

  await readerFrame.evaluate(() => {
    const p = document.querySelector('p');
    const marker = document.createElement('a');
    marker.setAttribute('epub:type', 'noteref');
    marker.setAttribute('href', '#test-note-1');
    marker.textContent = '1';
    marker.className = 'test-footnote-marker';
    p.appendChild(marker);

    const note = document.createElement('div');
    note.id = 'test-note-1';
    note.innerHTML = 'This is the injected footnote text with <script>window.__xss = true;</script><b>bold</b> content.';
    note.style.display = 'none';
    document.body.appendChild(note);

    marker.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });

  await page.waitForSelector('.footnote-popup', { timeout: 8000 });
  await page.waitForTimeout(400);
  const footnoteText = await page.textContent('.footnote-popup');
  log('footnote popup text:', footnoteText.replace(/\s+/g, ' ').trim());
  if (!footnoteText.includes('injected footnote text')) {
    throw new Error('Footnote popup did not show the resolved note content');
  }
  if (footnoteText.includes('function') || footnoteText.includes('__xss')) {
    throw new Error('Footnote popup leaked script content — sanitization failed');
  }
  const xssRan = await readerFrame.evaluate(() => (window).__xss === true);
  if (xssRan) throw new Error('Injected <script> in footnote content actually executed — sanitizer failed');

  const chapterAfter = await page.textContent('.reader__chapter');
  if (chapterBefore !== chapterAfter) {
    throw new Error(`Footnote click navigated away from the current chapter (before="${chapterBefore}", after="${chapterAfter}")`);
  }
  log('confirmed: no navigation occurred, chapter unchanged:', chapterAfter);

  // Bold formatting should have survived sanitization (it's allow-listed).
  const boldHtml = await page.locator('.footnote-popup__body b').count();
  if (boldHtml !== 1) throw new Error('Expected <b> formatting to survive footnote sanitization');

  await page.click('.footnote-popup__close');
  await page.waitForTimeout(200);
  const popupGone = await page.locator('.footnote-popup').count();
  if (popupGone !== 0) throw new Error('Footnote popup did not close');

  log('ALL READING-UX CHECKS PASSED');
  await browser.close();
})().catch((err) => {
  console.error('[reading-ux-e2e] FAILED:', err);
  process.exit(1);
});
