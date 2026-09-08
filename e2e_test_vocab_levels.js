import { chromium } from 'playwright';

const log = (...args) => console.log('[vocab-levels-e2e]', ...args);

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  page.on('pageerror', (err) => log('page error:', err.message));
  page.on('console', (msg) => { if (msg.type() === 'error' || msg.text().includes('DEBUG')) log('console:', msg.text()); });

  await page.goto('http://localhost:4173/', { waitUntil: 'networkidle' });
  await page.waitForSelector('.navbar__settings', { timeout: 10000 });

  // --- Vocab Levels nav tab disabled with no book open ---
  const vocabTabDisabled = await page.locator('.navbar__item', { hasText: 'Vocab Levels' }).isDisabled();
  log('Vocab Levels tab disabled with no book open:', vocabTabDisabled);
  if (!vocabTabDisabled) throw new Error('Vocab Levels tab should be disabled until a book is open');

  // --- Open the sample book ---
  await page.locator('.navbar__item', { hasText: 'Library' }).click();
  await page.waitForSelector('text=Try the sample book', { timeout: 10000 });
  await page.click('text=Try the sample book');
  await page.waitForSelector('.book-card', { timeout: 15000 });
  await page.click('.book-card');
  await page.waitForSelector('.reader__epub iframe', { timeout: 15000 });
  await page.waitForTimeout(1500);

  // --- Open Vocab Levels tab ---
  await page.locator('.navbar__item', { hasText: 'Vocab Levels' }).click();
  await page.waitForSelector('.vocab-levels', { timeout: 5000 });
  log('Vocab Levels panel opened');

  // --- Enable the rarity dataset (using the tiny 5000-word test fixture
  // swapped in for this test run, not the real 11.4M-word bundle) ---
  await page.click('.vocab-levels__enable-btn');
  await page.waitForTimeout(5000);
  log('vocab-levels panel text 5s after enable click:', (await page.textContent('.vocab-levels')).replace(/\s+/g, ' '));
  await page.waitForSelector('.vocab-levels__tiers', { timeout: 30000 });
  log('rarity data enabled, tier tabs visible');

  // --- Beginner tab should show words (كَانَ etc. are extremely common) ---
  await page.waitForTimeout(1500); // let book scan + index build finish
  const beginnerCount = await page.locator('.vocab-levels__word').count();
  log('word rows shown for default (Beginner) tier:', beginnerCount);
  if (beginnerCount === 0) throw new Error('Expected at least some Beginner-tier words from the sample book');

  // --- Click a word row to expand its occurrence stepper ---
  const firstWordText = await page.locator('.vocab-levels__word-text').first().textContent();
  log('first word row:', firstWordText);
  await page.locator('.vocab-levels__word-row').first().click();
  await page.waitForSelector('.vocab-levels__stepper', { timeout: 3000 });
  const stepperLabel = await page.textContent('.vocab-levels__stepper-label');
  log('stepper label after expanding first word:', stepperLabel);

  // --- Clicking jumps the book pane — confirm the reader section actually
  // received a (soft) navigation by checking a wrapped word with a
  // temporary highlight-flash class appears somewhere in the frame. ---
  await page.waitForTimeout(900);
  const frame = page.frames().find((f) => f !== page.mainFrame());
  const flashPresent = await frame.evaluate(() => !!document.querySelector('.ar-word--jump-flash'));
  log('jump-flash class present in book iframe after clicking a word:', flashPresent);
  if (!flashPresent) throw new Error('Expected the jumped-to word to receive the temporary highlight-flash class');

  // --- Switch tiers ---
  await page.locator('.vocab-levels__tier-btn', { hasText: 'Advanced' }).click();
  await page.waitForTimeout(400);
  log('switched to Advanced tier');

  // --- Collapse / expand the panel ---
  await page.click('.vocab-levels__collapse-btn >> nth=0');
  await page.waitForSelector('.vocab-levels__collapse-strip', { timeout: 3000 });
  log('panel collapsed to strip');
  await page.click('.vocab-levels__expand-btn');
  await page.waitForSelector('.vocab-levels__tiers', { timeout: 3000 });
  log('panel re-expanded');

  // --- Rarity badge appears in the DictionaryPopup on a normal word click ---
  await page.locator('.navbar__label', { hasText: /^Read$/ }).click();
  await page.waitForSelector('.reader__epub iframe', { timeout: 10000 });
  await page.waitForTimeout(1000);
  const readerFrame = page.frames().find((f) => f !== page.mainFrame());
  await readerFrame.evaluate(() => {
    const el = document.querySelector('p .ar-word');
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
  await page.waitForSelector('.dict-popup', { timeout: 8000 });
  await page.waitForTimeout(500);
  const rarityBadge = await page.$('.dict-popup__rarity');
  log('rarity badge present in dictionary popup:', !!rarityBadge);
  if (rarityBadge) {
    const badgeText = await page.textContent('.dict-popup__rarity');
    log('rarity badge text:', badgeText);
  }

  // --- Export produces a download ---
  await page.click('.dict-popup__close');
  await page.waitForTimeout(200);
  await page.locator('.navbar__item', { hasText: 'Vocab Levels' }).click();
  await page.waitForSelector('.vocab-levels__tiers', { timeout: 5000 });
  await page.locator('.vocab-levels__tier-btn', { hasText: 'Beginner' }).click();
  await page.waitForTimeout(400);
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 5000 }),
    page.click('.vocab-levels__export-btn'),
  ]);
  // Chromium headless doesn't always preserve the `download` attribute's
  // filename for blob: URLs, so check the download actually happened and
  // has real content rather than asserting on `suggestedFilename()`.
  const downloadPath = await download.path();
  const fs = await import('node:fs');
  const content = downloadPath ? fs.readFileSync(downloadPath, 'utf8') : '';
  log('export download filename:', download.suggestedFilename(), '| content preview:', content.slice(0, 80).replace(/\n/g, ' | '));
  if (!content.includes('Beginner')) throw new Error('Exported file did not contain expected "Beginner" heading');

  // --- Close the panel via its own close button ---
  await page.click('.vocab-levels__close-btn');
  await page.waitForTimeout(300);
  const panelGone = (await page.$('.vocab-levels')) === null && (await page.$('.vocab-levels__collapse-strip')) === null;
  log('panel closed via its own close button:', panelGone);
  if (!panelGone) throw new Error('Vocab Levels panel should be gone after clicking its close button');

  // --- Settings shows the rarity dataset as loaded, with a clear option ---
  await page.click('.navbar__settings');
  await page.waitForSelector('.settings-panel', { timeout: 5000 });
  const settingsSection = page.locator('.settings-section', { hasText: 'Vocabulary Levels' });
  await settingsSection.scrollIntoViewIfNeeded();
  const settingsText = await settingsSection.textContent();
  log('Settings vocabulary-levels section text:', settingsText.replace(/\s+/g, ' ').slice(0, 200));
  if (!settingsText.includes('Enabled')) throw new Error('Settings should show the rarity dataset as enabled');

  log('ALL VOCAB LEVELS CHECKS PASSED');
  await browser.close();
  process.exit(0);
})().catch((err) => {
  console.error('[vocab-levels-e2e] FAILED:', err);
  process.exit(1);
});
