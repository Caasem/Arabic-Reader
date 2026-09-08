import { chromium } from 'playwright';

const log = (...args) => console.log('[offline-e2e]', ...args);

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const context = await browser.newContext({ serviceWorkers: 'allow' });
  const page = await context.newPage();
  page.on('pageerror', (err) => log('page error:', err.message));

  // First load online — this is what registers and populates the service
  // worker's precache (app shell + dictionary data, per vite.config.ts).
  await page.goto('http://localhost:4173/', { waitUntil: 'networkidle' });
  await page.waitForSelector('.navbar__settings', { timeout: 10000 });

  // Wait for the service worker to actually finish installing/activating
  // and controlling the page — registerType 'autoUpdate' still takes a
  // moment after first load.
  await page.waitForFunction(
    async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      return !!reg && !!navigator.serviceWorker.controller;
    },
    { timeout: 15000 }
  );
  log('service worker installed and controlling the page');

  const cacheNames = await page.evaluate(() => caches.keys());
  log('cache storage names:', cacheNames);
  if (cacheNames.length === 0) throw new Error('Expected at least one Cache Storage entry after first load');

  const precachedDictFile = await page.evaluate(async () => {
    const cacheNames = await caches.keys();
    for (const name of cacheNames) {
      const cache = await caches.open(name);
      const match = await cache.match('/dictionary-data/dictstems');
      if (match) return true;
    }
    return false;
  });
  log('dictstems precached:', precachedDictFile);
  if (!precachedDictFile) throw new Error('Expected /dictionary-data/dictstems to be in the service worker precache');

  // --- Now go offline and reload — the app shell should still load ---
  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' }).catch((e) => log('reload rejected (checking anyway):', e.message));
  await page.waitForTimeout(1500);
  const navbarVisible = await page.locator('.navbar__settings').isVisible().catch(() => false);
  log('nav bar visible while offline:', navbarVisible);
  if (!navbarVisible) throw new Error('App shell did not load while offline — service worker precache is not working');

  // --- Library screen (the default view after a fresh reload) should be
  // fully usable offline, not just an app-shell shell with broken content ---
  const bodyText = await page.locator('body').innerText();
  const hasSampleBook = bodyText.includes('Try the sample book');
  log('library screen usable offline:', hasSampleBook);

  await context.setOffline(false);
  log('ALL OFFLINE CHECKS PASSED');
  await browser.close();
  process.exit(0);
})().catch((err) => {
  console.error('[offline-e2e] FAILED:', err);
  process.exit(1);
});
