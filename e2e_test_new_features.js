import { chromium } from 'playwright';

const log = (...args) => console.log('[new-features-e2e]', ...args);

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('pageerror', (err) => log('page error:', err.message));

  await page.goto('http://localhost:4173/', { waitUntil: 'networkidle' });
  await page.waitForSelector('.navbar__settings', { timeout: 10000 });

  // --- Enable sentence context + quick-add shortcut in Settings ---
  await page.click('.navbar__settings');
  await page.waitForSelector('.settings-panel', { timeout: 5000 });
  await page.locator('.settings-toggle', { hasText: 'Capture sentence context' }).locator('input').check();
  await page.locator('.settings-toggle', { hasText: 'Quick-add shortcut' }).locator('input').check();
  await page.waitForTimeout(300);
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

  // --- Click a word, confirm sentence context appears in the popup ---
  await frame.evaluate(() => {
    const el = document.querySelector('p .ar-word');
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
  await page.waitForSelector('.dict-popup', { timeout: 8000 });
  await page.waitForTimeout(600);
  const hasSentence = (await page.locator('.dict-popup__sentence').count()) > 0;
  log('sentence context shown in popup:', hasSentence);
  if (!hasSentence) throw new Error('Expected .dict-popup__sentence to be present with sentence context enabled');

  // --- Quick-add shortcut: Ctrl+Shift+A should save without clicking "+ Add" ---
  await page.keyboard.down('Control');
  await page.keyboard.down('Shift');
  await page.keyboard.press('A');
  await page.keyboard.up('Shift');
  await page.keyboard.up('Control');
  await page.waitForTimeout(300);
  const toastText = await page.locator('.reader__quick-add-toast').textContent().catch(() => null);
  log('quick-add toast:', toastText);
  if (!toastText || !toastText.includes('added to vocabulary')) {
    throw new Error(`Expected a "added to vocabulary" toast, got: ${toastText}`);
  }
  await page.click('.dict-popup__close');

  // --- Confirm it actually landed in Vocabulary, with sentence shown ---
  await page.locator('.navbar__item', { hasText: 'Vocabulary' }).click();
  await page.waitForSelector('.vocab-card', { timeout: 8000 });
  const vocabCardCount = await page.locator('.vocab-card').count();
  const vocabHasSentence = (await page.locator('.vocab-card__sentence').count()) > 0;
  log('vocab cards:', vocabCardCount, 'with sentence:', vocabHasSentence);
  if (vocabCardCount < 1) throw new Error('Expected at least one saved vocabulary card');
  if (!vocabHasSentence) throw new Error('Expected the saved vocab card to show sentence context');

  // --- Review: with a freshly-saved word, it should be due immediately ---
  await page.locator('.navbar__item', { hasText: 'Review' }).click();
  await page.waitForSelector('.review__card, .review__empty', { timeout: 8000 });
  const hasCard = (await page.locator('.review__card').count()) > 0;
  log('review card shown for due word:', hasCard);
  if (!hasCard) throw new Error('Expected a due review card right after saving a new word');
  await page.click('.review__card');
  await page.waitForSelector('.review__card-back', { timeout: 3000 });
  await page.click('.review__btn--good');
  await page.waitForTimeout(300);
  log('answered "Good" on review card without error');

  // --- Export backup, confirm it downloads valid JSON containing the item ---
  await page.click('.navbar__settings');
  await page.waitForSelector('.settings-panel', { timeout: 5000 });
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('text=Export backup'),
  ]);
  const path = await download.path();
  const fs = await import('node:fs');
  const backupJson = JSON.parse(fs.readFileSync(path, 'utf8'));
  log('exported backup vocabulary count:', backupJson.vocabulary.length);
  if (!backupJson.vocabulary.length) throw new Error('Expected exported backup to contain at least one vocabulary item');
  if (backupJson.formatVersion !== 1) throw new Error('Expected formatVersion 1 in backup');

  // --- Import it back in (should report success, not error) ---
  const [fileChooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.click('text=Import backup'),
  ]);
  await fileChooser.setFiles(path);
  await page.waitForTimeout(500);
  const importStatus = await page.locator('.settings-section', { hasText: 'Backup' }).locator('.settings-section__note').last().textContent();
  log('import status:', importStatus);
  if (!importStatus || !importStatus.toLowerCase().includes('imported')) {
    throw new Error(`Expected an "Imported ..." status message, got: ${importStatus}`);
  }

  // --- Anki sync: no Anki server running here, so confirm it fails
  // gracefully with the CORS/unreachable explanation rather than crashing.
  await page.click('text=Sync to Anki');
  await page.waitForTimeout(1500);
  const ankiStatus = await page
    .locator('.settings-section', { hasText: 'Anki sync' })
    .locator('.settings-section__note')
    .last()
    .textContent();
  log('anki sync status (expected: unreachable):', ankiStatus);
  if (!ankiStatus || !ankiStatus.toLowerCase().includes("couldn't reach anki")) {
    throw new Error(`Expected an unreachable-Anki explanation, got: ${ankiStatus}`);
  }

  log('ALL NEW-FEATURE CHECKS PASSED');
  await browser.close();
  process.exit(0);
})().catch((err) => {
  console.error('[new-features-e2e] FAILED:', err);
  process.exit(1);
});
