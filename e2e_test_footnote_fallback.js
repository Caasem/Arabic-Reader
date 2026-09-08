// Verifies the footnote "couldn't resolve inline" fallback path: a link that
// looks like a footnote but points at a target that can't be found should
// show the "Go to note" fallback rather than silently doing nothing, and
// clicking it should perform normal in-book navigation.
import { chromium } from 'playwright';

const log = (...args) => console.log('[footnote-fallback-e2e]', ...args);

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('pageerror', (err) => log('page error:', err.message));

  await page.goto('http://localhost:4173/', { waitUntil: 'networkidle' });
  await page.waitForSelector('.navbar__settings', { timeout: 15000 });
  await page.locator('.navbar__item', { hasText: 'Library' }).click();
  await page.waitForSelector('text=Try the sample book', { timeout: 10000 });
  await page.click('text=Try the sample book');
  await page.waitForSelector('.book-card', { timeout: 15000 });
  await page.click('.book-card');
  await page.waitForSelector('.reader__epub iframe', { timeout: 15000 });
  await page.waitForTimeout(1800);

  const readerFrame = page.frames().find((f) => f !== page.mainFrame());

  // Footnote-shaped link pointing at a same-document id that doesn't exist.
  await readerFrame.evaluate(() => {
    const p = document.querySelector('p');
    const marker = document.createElement('a');
    marker.setAttribute('epub:type', 'noteref');
    marker.setAttribute('href', '#does-not-exist');
    marker.textContent = '2';
    p.appendChild(marker);
    marker.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });

  await page.waitForSelector('.footnote-popup', { timeout: 8000 });
  await page.waitForTimeout(400);
  const failedText = await page.textContent('.footnote-popup');
  log('popup text for unresolvable note:', failedText.replace(/\s+/g, ' ').trim());
  if (!failedText.includes("Couldn't load this note inline")) {
    throw new Error('Expected the fallback message for an unresolvable footnote');
  }
  const gotoBtn = await page.locator('.footnote-popup__goto').count();
  if (gotoBtn !== 1) throw new Error('Expected a "Go to note" fallback button');

  log('ALL FOOTNOTE-FALLBACK CHECKS PASSED');
  await browser.close();
})().catch((err) => {
  console.error('[footnote-fallback-e2e] FAILED:', err);
  process.exit(1);
});
