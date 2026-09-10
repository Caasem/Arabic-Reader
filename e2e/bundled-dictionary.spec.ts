import { test, expect } from '@playwright/test';

/**
 * The bundled AraMorph dictionary (public/dictionary-data/) must load
 * automatically on first run with zero manual upload, be the sole
 * default-enabled provider (mocks off by default), and resolve a real
 * lookup through the production click -> dictionaryManager.lookup() ->
 * popup path -- see the Android "no definition found" bug this guards
 * against (CHANGELOG v0.9.0).
 */
test('bundled AraMorph dictionary auto-loads and resolves a real lookup', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('.navbar__settings', { timeout: 10000 });
  await page.waitForTimeout(1000); // let the parsed-table cache load / build

  await page.click('.navbar__settings');
  await page.waitForSelector('.settings-panel', { timeout: 5000 });

  await page.waitForSelector('text=Data loaded', { timeout: 15000 });

  const rows = await page.locator('.settings-row--dict').evaluateAll((els) =>
    els.map((el) => ({
      label: el.querySelector('.settings-toggle__label')?.textContent ?? '',
      checked: (el.querySelector('input[type=checkbox]') as HTMLInputElement | null)?.checked ?? false,
    }))
  );
  const aramorphRow = rows.find((r) => r.label.includes('AraMorph'));
  const mockRows = rows.filter((r) => r.label.includes('Dictionary A') || r.label.includes('Dictionary B'));
  expect(aramorphRow?.checked, 'expected AraMorph enabled by default').toBe(true);
  expect(mockRows.some((r) => r.checked), 'expected mock dictionaries OFF by default').toBe(false);

  await page.click('.settings-panel__close');
  await page.locator('.navbar__item', { hasText: 'Library' }).click();
  await page.waitForSelector('text=Try the sample book', { timeout: 10000 });
  await page.click('text=Try the sample book');
  await page.waitForSelector('.book-card', { timeout: 15000 });
  await page.click('.book-card');
  await page.waitForSelector('.reader__epub iframe', { timeout: 15000 });
  await page.waitForTimeout(1800);

  const readerFrame = page.frames().find((f) => f !== page.mainFrame())!;
  await readerFrame.evaluate(() => {
    const p = document.querySelector('p')!;
    const span = document.createElement('span');
    span.className = 'ar-word';
    span.dataset.word = 'كتاب';
    span.textContent = 'كتاب';
    p.appendChild(span);
    span.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });

  await page.waitForSelector('.dict-popup', { timeout: 8000 });
  await page.waitForTimeout(600);
  const popupText = (await page.textContent('.dict-popup'))!;

  expect(popupText).not.toContain('No entry found');
  expect(popupText.toLowerCase()).toContain('book');

  // Regression: createDictTable's <pos>...</pos> extraction used to leave a
  // stray "</pos>" (and raw morphological affix codes) stuck onto glosses.
  expect(popupText).not.toContain('</pos');
  expect(popupText).not.toContain('<pos>');
  expect(/PVSUFF|NSUFF|POSS_PRON|\/DET\+|\/CONJ\+|\/PREP\+/.test(popupText)).toBe(false);
});
