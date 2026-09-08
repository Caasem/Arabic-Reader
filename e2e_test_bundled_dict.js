// Verifies the bundled AraMorph dictionary (public/dictionary-data/) loads
// automatically on first run with zero manual upload, that it's the sole
// default-enabled provider (mocks off by default), and that a real lookup
// against the full bundled dataset resolves through the production
// click -> dictionaryManager.lookup() -> popup path.
import { chromium } from 'playwright';

const log = (...args) => console.log('[bundled-dict-e2e]', ...args);

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('pageerror', (err) => log('page error:', err.message));

  await page.goto('http://localhost:4173/', { waitUntil: 'networkidle' });
  await page.waitForSelector('.navbar__settings', { timeout: 10000 });

  // Give the async bundled fetch (3.6MB dictstems) + parse a moment.
  await page.waitForTimeout(2500);

  await page.click('.navbar__settings');
  await page.waitForSelector('.settings-panel', { timeout: 5000 });

  // --- AraMorph shows "Data loaded" with zero manual upload ---
  await page.waitForSelector('text=Data loaded', { timeout: 8000 });
  log('AraMorph badge shows "Data loaded" with no upload performed');

  // --- AraMorph is enabled by default; mock dictionaries are not ---
  const rows = await page.$$eval('.settings-row--dict', (els) =>
    els.map((el) => ({
      label: el.querySelector('.settings-toggle__label')?.textContent ?? '',
      checked: el.querySelector('input[type=checkbox]')?.checked ?? false,
    }))
  );
  log('provider rows:', JSON.stringify(rows));

  const aramorphRow = rows.find((r) => r.label.includes('AraMorph'));
  const mockRows = rows.filter((r) => r.label.toLowerCase().includes('mock') || r.label.includes('Dictionary A') || r.label.includes('Dictionary B'));

  if (!aramorphRow || !aramorphRow.checked) throw new Error('Expected AraMorph to be enabled by default');
  if (mockRows.some((r) => r.checked)) throw new Error('Expected mock dictionaries to be OFF by default');

  // --- Real lookup against the full bundled dataset, via a real word click ---
  await page.click('.settings-panel__close');
  await page.locator('.navbar__item', { hasText: 'Library' }).click();
  await page.waitForSelector('text=Try the sample book', { timeout: 10000 });
  await page.click('text=Try the sample book');
  await page.waitForSelector('.book-card', { timeout: 15000 });
  await page.click('.book-card');
  await page.waitForSelector('.reader__epub iframe', { timeout: 15000 });
  await page.waitForTimeout(1800);

  const readerFrame = page.frames().find((f) => f !== page.mainFrame());
  await readerFrame.evaluate(() => {
    const p = document.querySelector('p');
    const span = document.createElement('span');
    span.className = 'ar-word';
    span.dataset.word = 'كتاب';
    span.textContent = 'كتاب';
    p.appendChild(span);
    span.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });

  await page.waitForSelector('.dict-popup', { timeout: 8000 });
  await page.waitForTimeout(600);
  const popupText = await page.textContent('.dict-popup');
  log('popup text for كتاب via bundled AraMorph:', popupText.replace(/\s+/g, ' ').slice(0, 400));

  if (popupText.includes('No entry found')) {
    throw new Error('AraMorph provider returned no entries for كتاب using the bundled default dataset');
  }
  if (!popupText.toLowerCase().includes('book')) {
    throw new Error('AraMorph lookup for كتاب did not include the expected "book" gloss');
  }

  // Regression check: createDictTable's <pos>...</pos> extraction used to
  // leave a stray "</pos>" (and, more generally, raw morphological affix
  // codes like "+hu/POSS_PRON_3MS") stuck onto every AraMorph gloss — see
  // CHANGELOG v0.2.2. Confirm popups stay clean of both.
  if (popupText.includes('</pos') || popupText.includes('<pos>')) {
    throw new Error('Stray <pos>/</pos> tag text leaking into the AraMorph popup');
  }
  if (/PVSUFF|NSUFF|POSS_PRON|\/DET\+|\/CONJ\+|\/PREP\+/.test(popupText)) {
    throw new Error('Raw AraMorph morphological affix codes leaking into the popup as "noise"');
  }

  log('ALL BUNDLED-DICTIONARY CHECKS PASSED');
  await browser.close();
  process.exit(0);
})().catch((err) => {
  console.error('[bundled-dict-e2e] FAILED:', err);
  process.exit(1);
});
