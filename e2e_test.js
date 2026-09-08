import { chromium } from 'playwright';

const log = (...args) => console.log('[e2e]', ...args);

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('console', (msg) => {
    if (msg.type() === 'error') log('console error:', msg.text());
  });
  page.on('pageerror', (err) => log('page error:', err.message));

  await page.goto('http://localhost:4173/', { waitUntil: 'networkidle' });
  log('loaded app');

  // Library view should render with "Try the sample book"
  await page.waitForSelector('text=Try the sample book', { timeout: 10000 });
  log('library rendered');

  await page.click('text=Try the sample book');
  log('clicked sample book import, waiting for card...');
  await page.waitForSelector('.book-card', { timeout: 15000 });
  log('book card appeared');

  await page.click('.book-card');
  log('clicked book card, waiting for reader...');

  await page.waitForSelector('.reader__epub iframe', { timeout: 15000 });
  log('epub iframe present');

  // give epub.js time to render the first section + our word wrapping
  await page.waitForTimeout(2500);

  const frame = page.frames().find((f) => f.url().includes('OEBPS') || f.name() === '' && f !== page.mainFrame());
  const targetFrame = page.frames().find((f) => f !== page.mainFrame());
  if (!targetFrame) throw new Error('epub iframe not found among page frames');
  log('epub frame url:', targetFrame.url());

  const wordCount = await targetFrame.evaluate(() => document.querySelectorAll('.ar-word').length);
  log('wrapped word count in first rendered section:', wordCount);
  if (wordCount === 0) throw new Error('No .ar-word spans found — word wrapping failed');

  // Click the first Arabic word via a real dispatched click (matches the
  // approach that worked reliably for the vanilla prototype's iframe tests).
  const clicked = await targetFrame.evaluate(() => {
    // Prefer a word inside a paragraph (skip the chapter-title <h1>, which
    // isn't in the mock lexicon) so the lookup actually resolves an entry.
    const el = document.querySelector('p .ar-word') || document.querySelector('.ar-word');
    if (!el) return null;
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    return el.dataset.word;
  });
  log('dispatched click on word:', clicked);

  await page.waitForSelector('.dict-popup', { timeout: 8000 });
  log('dictionary popup appeared');
  await page.waitForTimeout(800); // let the async lookup resolve

  const popupText = await page.textContent('.dict-popup');
  log('popup text:', popupText.replace(/\s+/g, ' ').slice(0, 300));

  if (popupText.includes('No entry found')) {
    throw new Error(`Expected a resolved dictionary entry for "${clicked}" but got "No entry found"`);
  }

  const hasSaveButton = await page.$('.dict-popup__save');
  if (!hasSaveButton) throw new Error('No save button in popup');

  const closeBox = await page.locator('.dict-popup__close').boundingBox();
  if (!closeBox || closeBox.y < 0 || closeBox.y > 900 || closeBox.x < 0 || closeBox.x > 1280) {
    throw new Error(`Popup close button rendered outside viewport: ${JSON.stringify(closeBox)}`);
  }
  log('popup close button is within viewport:', closeBox);

  const saveButtonDisabled = await page.getAttribute('.dict-popup__save', 'disabled');
  if (saveButtonDisabled === null) {
    await page.click('.dict-popup__save');
    log('clicked add-to-vocabulary');
    await page.waitForSelector('.dict-popup__save--saved', { timeout: 5000 });
    log('save button now shows saved state');
  } else {
    log('word already saved (skipping save-click assertion)');
  }

  await page.click('.dict-popup__close');
  await page.waitForTimeout(300);

  // Go to vocabulary tab
  await page.locator('.navbar__item', { hasText: 'Vocabulary' }).click();
  await page.waitForSelector('.vocab', { timeout: 5000 });
  await page.waitForTimeout(500);
  const vocabCardCount = await page.$$eval('.vocab-card', (els) => els.length);
  log('vocabulary cards:', vocabCardCount);
  if (vocabCardCount === 0) throw new Error('Vocabulary tab shows 0 saved words after saving one');

  const vocabText = await page.textContent('.vocab');
  log('vocab tab text (trimmed):', vocabText.replace(/\s+/g, ' ').slice(0, 300));

  // Back to reader, verify TOC + navigation works
  await page.locator('.navbar__label', { hasText: /^Read$/ }).click();
  await page.waitForSelector('.reader__epub iframe', { timeout: 10000 });
  await page.waitForTimeout(1500); // let epub.js finish loading nav/toc on remount
  await page.click('text=Contents');
  await page.waitForSelector('.reader__toc', { timeout: 5000 });
  const tocItemCount = await page.$$eval('.toc-list__item', (els) => els.length);
  log('TOC items:', tocItemCount);
  if (tocItemCount < 2) throw new Error('Expected at least 2 TOC entries for the 3-chapter sample book');

  // --- Highlighting: select a run of text in the rendered section and pick
  // a color from the toolbar, then verify it shows up in the Highlights tab.
  await page.locator('.navbar__label', { hasText: /^Read$/ }).click();
  await page.waitForSelector('.reader__epub iframe', { timeout: 10000 });
  await page.waitForTimeout(1500);

  const readerFrame = page.frames().find((f) => f !== page.mainFrame());
  if (!readerFrame) throw new Error('epub iframe not found for highlight test');

  const selectionInfo = await readerFrame.evaluate(() => {
    const p = document.querySelector('p');
    if (!p || !p.firstChild) return null;
    const textNode = Array.from(p.childNodes).find((n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim());
    // Text nodes containing Arabic were already split into .ar-word spans by
    // wordInteraction, so select across a couple of adjacent word spans
    // instead (mirrors how a user would drag-select a phrase).
    const words = p.querySelectorAll('.ar-word');
    if (words.length < 3) return null;
    const range = document.createRange();
    range.setStart(words[0].firstChild, 0);
    range.setEnd(words[2].firstChild, words[2].firstChild.textContent.length);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
    return { text: sel.toString() };
  });
  log('made a text selection:', selectionInfo);
  if (!selectionInfo) throw new Error('Could not create a text selection in the rendered section');

  // epub.js listens for mouseup (not selectionchange) to fire its 'selected'
  // event, so dispatch one on the iframe document to trigger it.
  await readerFrame.evaluate(() => {
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });

  await page.waitForSelector('.selection-toolbar', { timeout: 8000 });
  log('selection toolbar appeared');
  await page.click('.selection-toolbar__swatch--yellow');
  await page.waitForTimeout(400);

  await page.locator('.navbar__item', { hasText: 'Highlights' }).click();
  await page.waitForSelector('.hl-card', { timeout: 5000 });
  const hlCardCount = await page.$$eval('.hl-card', (els) => els.length);
  log('highlight cards:', hlCardCount);
  if (hlCardCount !== 1) throw new Error(`Expected exactly 1 saved highlight, found ${hlCardCount}`);
  const hlText = await page.textContent('.hl-card');
  log('highlight card text:', hlText.replace(/\s+/g, ' ').trim());

  // Persistence-across-restart check: reload the page entirely (fresh JS
  // context, same IndexedDB) and confirm the book + saved vocab survive.
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.book-card', { timeout: 10000 });
  const booksAfterReload = await page.$$eval('.book-card', (els) => els.length);
  log('books after reload:', booksAfterReload);
  if (booksAfterReload < 1) throw new Error('Book did not persist across a full page reload');

  await page.locator('.navbar__item', { hasText: 'Vocabulary' }).click();
  await page.waitForSelector('.vocab-card', { timeout: 5000 });
  const vocabAfterReload = await page.$$eval('.vocab-card', (els) => els.length);
  log('vocab cards after reload:', vocabAfterReload);
  if (vocabAfterReload < 1) throw new Error('Vocabulary did not persist across a full page reload');

  await page.locator('.navbar__item', { hasText: 'Highlights' }).click();
  await page.waitForSelector('.hl-card', { timeout: 5000 });
  const hlAfterReload = await page.$$eval('.hl-card', (els) => els.length);
  log('highlight cards after reload:', hlAfterReload);
  if (hlAfterReload < 1) throw new Error('Highlight did not persist across a full page reload');

  // And confirm the highlight actually re-renders visually in the page
  // (not just in the sidebar list) after reopening the book. Reloading
  // wiped in-memory app state (no book is "active"), so go back through
  // the library rather than the nav bar's Read tab.
  await page.locator('.navbar__item', { hasText: 'Library' }).click();
  await page.waitForSelector('.book-card', { timeout: 5000 });
  await page.click('.book-card');
  await page.waitForSelector('.reader__epub iframe', { timeout: 10000 });
  await page.waitForTimeout(1800);
  // epub.js (via marks-pane) renders highlight marks as an SVG overlay in
  // the *main* document, positioned over the iframe — not inside the
  // iframe's own contentDocument — so look for it on the top-level page.
  const renderedHighlightCount = await page.$$eval('[ref="ar-highlight"]', (els) => els.length);
  log('rendered highlight marks in section after reload:', renderedHighlightCount);
  if (renderedHighlightCount < 1) {
    throw new Error('Saved highlight did not visually re-render in the book after reopening it');
  }

  log('ALL CHECKS PASSED');
  await browser.close();
  process.exit(0);
})().catch((err) => {
  console.error('[e2e] FAILED:', err);
  process.exit(1);
});
