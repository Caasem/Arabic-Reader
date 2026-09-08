import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const log = (...args) => console.log('[settings-e2e]', ...args);

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('pageerror', (err) => log('page error:', err.message));

  await page.goto('http://localhost:4173/', { waitUntil: 'networkidle' });
  await page.waitForSelector('.navbar__settings', { timeout: 10000 });

  // --- Settings panel opens ---
  await page.click('.navbar__settings');
  await page.waitForSelector('.settings-panel', { timeout: 5000 });
  log('settings panel opened');

  // --- Reading preferences: theme ---
  await page.click('.segmented__item >> text=Dark');
  await page.waitForTimeout(200);
  const themeAttr = await page.evaluate(() => document.documentElement.dataset.theme);
  log('theme after clicking Dark:', themeAttr);
  if (themeAttr !== 'dark') throw new Error(`Expected data-theme="dark", got "${themeAttr}"`);

  // --- Reading preferences: font size persists ---
  const fontSlider = page.locator('.settings-row', { hasText: 'Font size' }).locator('input[type=range]');
  await fontSlider.fill('140');
  await page.waitForTimeout(200);
  const fontLabel = await page.textContent('.settings-row:has-text("Font size") .settings-row__value');
  log('font size label:', fontLabel);
  if (fontLabel.trim() !== '140%') throw new Error(`Expected font size label "140%", got "${fontLabel}"`);

  // --- Dictionary switching: providers listed ---
  // AraMorph is the sole default-enabled provider now that it's bundled by
  // default (see e2e_test_bundled_dict.js); the mocks are listed but start
  // OFF. Explicitly enable both mocks here so this test can still exercise
  // provider filtering (enabling B, then disabling A) end to end.
  const providerRows = await page.$$eval('.settings-row--dict .settings-toggle__label', (els) => els.map((e) => e.textContent));
  log('dictionary providers listed:', providerRows);
  if (!providerRows.some((p) => p.includes('Dictionary A'))) throw new Error('Dictionary A not listed in Settings');
  if (!providerRows.some((p) => p.includes('AraMorph'))) throw new Error('AraMorph provider not listed in Settings');

  await page.locator('.settings-row--dict', { hasText: 'Dictionary A' }).locator('input[type=checkbox]').check();
  await page.locator('.settings-row--dict', { hasText: 'Dictionary B' }).locator('input[type=checkbox]').check();
  log('enabled Dictionary A and Dictionary B');
  await page.locator('.settings-row--dict', { hasText: 'Dictionary A' }).locator('input[type=checkbox]').uncheck();
  log('unchecked Dictionary A');
  // Preference writes are fire-and-forget (see PreferencesContext.updatePrefs) —
  // give the IndexedDB write a moment to actually land before reloading,
  // matching the wait already used after the theme/font-size changes above.
  await page.waitForTimeout(300);

  // --- Reload and confirm prefs (theme, font size, disabled provider) persisted ---
  await page.reload({ waitUntil: 'networkidle' });
  const themeAfterReload = await page.evaluate(() => document.documentElement.dataset.theme);
  log('theme after reload:', themeAfterReload);
  if (themeAfterReload !== 'dark') throw new Error('Theme did not persist across reload');

  await page.click('.navbar__settings');
  await page.waitForSelector('.settings-panel', { timeout: 5000 });
  const fontLabelAfterReload = await page.textContent('.settings-row:has-text("Font size") .settings-row__value');
  log('font size after reload:', fontLabelAfterReload);
  if (fontLabelAfterReload.trim() !== '140%') throw new Error('Font size preference did not persist');

  const dictAChecked = await page
    .locator('.settings-row--dict', { hasText: 'Dictionary A' })
    .locator('input[type=checkbox]')
    .isChecked();
  log('Dictionary A checked after reload:', dictAChecked);
  if (dictAChecked) throw new Error('Dictionary A toggle-off did not persist across reload');

  // --- Confirm the disabled provider is actually excluded from lookups ---
  // (open the sample book, click a known word, and check Dictionary A's
  // gloss is absent from the popup while Dictionary B's is still present)
  await page.click('.settings-panel__close');
  await page.locator('.navbar__item', { hasText: 'Library' }).click();
  await page.waitForSelector('text=Try the sample book', { timeout: 10000 });
  await page.click('text=Try the sample book');
  await page.waitForSelector('.book-card', { timeout: 15000 });
  await page.click('.book-card');
  await page.waitForSelector('.reader__epub iframe', { timeout: 15000 });
  await page.waitForTimeout(1800);

  const frame = page.frames().find((f) => f !== page.mainFrame());
  await frame.evaluate(() => {
    const el = document.querySelector('p .ar-word');
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
  await page.waitForSelector('.dict-popup', { timeout: 8000 });
  await page.waitForTimeout(600);
  const popupText = await page.textContent('.dict-popup');
  log('popup text with Dictionary A disabled:', popupText.replace(/\s+/g, ' ').slice(0, 300));
  if (popupText.includes('Dictionary A')) throw new Error('Dictionary A entry appeared even though it was switched off');
  if (!popupText.includes('Dictionary B')) throw new Error('Dictionary B entry missing — disabling A should not affect B');

  // --- Real dictionary data: upload the AraMorph test files and verify a
  // real (non-mock) lookup resolves through the ported engine.
  await page.click('.dict-popup__close');
  await page.waitForTimeout(200);
  await page.click('.navbar__settings');
  await page.waitForSelector('.settings-panel', { timeout: 5000 });

  // AraMorph now auto-loads the bundled dataset by default, so the button
  // already reads "Replace with custom files" and the badge already shows
  // "Data loaded" before this upload — the check below confirms uploading a
  // (tiny, single-word) custom dataset still overrides it as expected.
  const testDictDir = join(__dirname, '..', 'ereader', 'testdict');
  const dictFileNames = ['dictprefixes', 'dictstems', 'dictsuffixes', 'tableab', 'tableac', 'tablebc'];
  const [fileChooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.click('text=Replace with custom files'),
  ]);
  await fileChooser.setFiles(dictFileNames.map((n) => join(testDictDir, n)));
  await page.waitForSelector('text=Data loaded', { timeout: 8000 });
  log('AraMorph test dictionary files uploaded, badge shows "Data loaded"');

  // Confirm the AraMorph provider actually resolves a real lookup, through
  // the exact same click -> dictionaryManager.lookup() path a reader uses.
  // The tiny test dataset only covers one word (Buckwalter "Al"+"ktAb" =
  // "الكتاب" = "the book"), which isn't in the sample book's prose, so
  // inject one `.ar-word` span for it into the currently-rendered section
  // and dispatch a real click — this exercises the production code path,
  // not a test-only reach-in.
  await page.click('.settings-panel__close');
  await page.locator('.navbar__label', { hasText: /^Read$/ }).click();
  await page.waitForSelector('.reader__epub iframe', { timeout: 10000 });
  await page.waitForTimeout(1200);
  const readerFrame = page.frames().find((f) => f !== page.mainFrame());

  await readerFrame.evaluate(() => {
    const p = document.querySelector('p');
    const span = document.createElement('span');
    span.className = 'ar-word';
    span.dataset.word = 'الكتاب';
    span.textContent = 'الكتاب';
    p.appendChild(span);
    span.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });

  await page.waitForSelector('.dict-popup', { timeout: 8000 });
  await page.waitForTimeout(600);
  const aramorphPopupText = await page.textContent('.dict-popup');
  log('popup text for الكتاب via AraMorph:', aramorphPopupText.replace(/\s+/g, ' ').slice(0, 300));
  if (aramorphPopupText.includes('No entry found')) {
    throw new Error('AraMorph provider returned no entries for الكتاب after uploading test data');
  }
  if (!aramorphPopupText.toLowerCase().includes('book')) {
    throw new Error('AraMorph lookup did not include the expected "book" gloss');
  }

  log('ALL SETTINGS/DICTIONARY CHECKS PASSED');
  await browser.close();
  process.exit(0);
})().catch((err) => {
  console.error('[settings-e2e] FAILED:', err);
  process.exit(1);
});
