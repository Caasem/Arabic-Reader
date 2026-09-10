import { test, expect } from '@playwright/test';

test('service worker precaches the app shell + dictionary data, app shell loads offline', async ({ browser }) => {
  const context = await browser.newContext({ serviceWorkers: 'allow' });
  const page = await context.newPage();

  await page.goto('/');
  await page.waitForSelector('.navbar__settings', { timeout: 10000 });

  await page.waitForFunction(
    async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      return !!reg && !!navigator.serviceWorker.controller;
    },
    { timeout: 15000 }
  );

  const cacheNames = await page.evaluate(() => caches.keys());
  expect(cacheNames.length, 'expected at least one Cache Storage entry after first load').toBeGreaterThan(0);

  // The controller being active only means the SW took over the page, not
  // that it has *finished* precaching (dictstems alone is ~3.7MB) -- poll
  // rather than check once, since a fixed delay is either too short on a
  // slow CI runner or wastes time on a fast one.
  await expect
    .poll(
      async () =>
        page.evaluate(async () => {
          for (const name of await caches.keys()) {
            const cache = await caches.open(name);
            if (await cache.match('/dictionary-data/dictstems')) return true;
          }
          return false;
        }),
      { message: 'expected /dictionary-data/dictstems in the service worker precache', timeout: 20000 }
    )
    .toBe(true);

  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(1500);
  const navbarVisible = await page.locator('.navbar__settings').isVisible().catch(() => false);
  await context.setOffline(false);
  expect(navbarVisible, 'app shell did not load while offline -- service worker precache is not working').toBe(true);

  await context.close();
});
