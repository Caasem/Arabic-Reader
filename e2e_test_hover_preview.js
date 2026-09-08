import { chromium } from 'playwright';

const log = (...args) => console.log('[hover-preview-e2e]', ...args);

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('pageerror', (err) => log('page error:', err.message));

  await page.goto('http://localhost:4173/', { waitUntil: 'networkidle' });
  await page.waitForSelector('.navbar__settings', { timeout: 10000 });

  // --- Toggle defaults to OFF ---
  await page.click('.navbar__settings');
  await page.waitForSelector('.settings-panel', { timeout: 5000 });
  const hoverRow = page.locator('.settings-row', { hasText: 'Show translation on hover' });
  const initiallyChecked = await hoverRow.locator('input[type=checkbox]').isChecked();
  log('hover preview toggle initially checked:', initiallyChecked);
  if (initiallyChecked) throw new Error('hoverPreviewEnabled should default to OFF');

  // Open the sample book (mock providers, so lookups are deterministic and fast).
  await page.click('.settings-panel__close');
  await page.locator('.navbar__item', { hasText: 'Library' }).click();
  await page.waitForSelector('text=Try the sample book', { timeout: 10000 });
  await page.click('text=Try the sample book');
  await page.waitForSelector('.book-card', { timeout: 15000 });
  await page.click('.book-card');
  await page.waitForSelector('.reader__epub iframe', { timeout: 15000 });
  await page.waitForTimeout(1800);

  const frame = () => page.frames().find((f) => f !== page.mainFrame());

  // --- With the toggle OFF, hovering a word must NOT show a preview ---
  await frame().evaluate(() => {
    const el = document.querySelector('p .ar-word');
    el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true }));
  });
  await page.waitForTimeout(600);
  const previewWhileOff = await page.$('.hover-preview');
  log('preview element present while toggle OFF:', !!previewWhileOff);
  if (previewWhileOff) throw new Error('Hover preview appeared even though the preference is OFF by default');

  // --- Enable the toggle in Settings ---
  await page.click('.navbar__settings');
  await page.waitForSelector('.settings-panel', { timeout: 5000 });
  await hoverRow.locator('input[type=checkbox]').check();
  log('enabled hover preview toggle');
  await page.click('.settings-panel__close');
  await page.locator('.navbar__label', { hasText: /^Read$/ }).click();
  await page.waitForSelector('.reader__epub iframe', { timeout: 10000 });
  await page.waitForTimeout(1200);

  // --- With the toggle ON, hovering a word shows the condensed pill ---
  const targetRect = await frame().evaluate(() => {
    const el = document.querySelector('p .ar-word');
    const r = el.getBoundingClientRect();
    el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true, relatedTarget: document.body }));
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  });
  log('target word rect:', targetRect);
  await page.waitForSelector('.hover-preview', { timeout: 3000 });
  const previewText = await page.textContent('.hover-preview__text');
  log('hover preview text:', previewText);
  if (!previewText || !previewText.trim()) throw new Error('Hover preview appeared but had no gloss text');

  // --- Mouseout dismisses it ---
  await frame().evaluate(() => {
    const el = document.querySelector('p .ar-word');
    el.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, cancelable: true, relatedTarget: document.body }));
  });
  await page.waitForTimeout(300);
  const previewAfterOut = await page.$('.hover-preview');
  log('preview element present after mouseout:', !!previewAfterOut);
  if (previewAfterOut) throw new Error('Hover preview did not disappear on mouseout');

  // --- Click still opens the full popup, unaffected by hover wiring ---
  await frame().evaluate(() => {
    const el = document.querySelector('p .ar-word');
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
  await page.waitForSelector('.dict-popup', { timeout: 8000 });
  const popupText = await page.textContent('.dict-popup');
  log('popup text on click:', popupText.replace(/\s+/g, ' ').slice(0, 200));
  await page.click('.dict-popup__close');
  await page.waitForTimeout(200);

  // --- Reload: preference persists as ON ---
  await page.reload({ waitUntil: 'networkidle' });
  await page.click('.navbar__settings');
  await page.waitForSelector('.settings-panel', { timeout: 5000 });
  const checkedAfterReload = await page
    .locator('.settings-row', { hasText: 'Show translation on hover' })
    .locator('input[type=checkbox]')
    .isChecked();
  log('hover preview toggle checked after reload:', checkedAfterReload);
  if (!checkedAfterReload) throw new Error('hoverPreviewEnabled did not persist across reload');

  log('ALL HOVER PREVIEW CHECKS PASSED');
  await browser.close();
  process.exit(0);
})().catch((err) => {
  console.error('[hover-preview-e2e] FAILED:', err);
  process.exit(1);
});
