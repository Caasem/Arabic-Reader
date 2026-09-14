import { test, expect } from '@playwright/test';

test('service worker precaches the app shell and dictionary; the app and dictionary work offline', async ({ browser }) => {
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

  // The dictionary data is embedded in the worker chunk (~4MB). An active
  // controller doesn't mean precaching has finished, so poll.
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          for (const name of await caches.keys()) {
            const requests = await (await caches.open(name)).keys();
            if (requests.some((r) => /aramorph\.worker-[\w-]+\.js/.test(r.url))) return true;
          }
          return false;
        }),
      { message: 'expected the dictionary worker chunk in the service worker precache', timeout: 20000 }
    )
    .toBe(true);

  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
  const navbarVisible = await page
    .waitForSelector('.navbar__settings', { timeout: 10000 })
    .then(() => true)
    .catch(() => false);
  expect(navbarVisible, 'app shell did not load while offline -- service worker precache is not working').toBe(true);

  // The dictionary still loads with no network.
  await page.click('.navbar__settings');
  await expect(page.getByText('Data loaded')).toBeVisible({ timeout: 30000 });

  await context.setOffline(false);
  await context.close();
});
