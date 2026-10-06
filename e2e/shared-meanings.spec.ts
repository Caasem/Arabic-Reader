import { test, expect } from '@playwright/test';
import { useOriginalReader } from './originalReader';

test.beforeEach(async ({ page }) => useOriginalReader(page));

/**
 * Shared meanings (src/crowdSync) ships switched off: a build without a service address says so, the switch cannot be
 * turned on, and the app makes no request to any crowd host.
 */
test('Shared meanings is present, off and unavailable in a build with no service address', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (r) => requests.push(r.url()));
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.click('.navbar__settings');
  await page.waitForSelector('.settings-panel');

  const section = page.locator('.settings-section', { has: page.getByRole('heading', { name: 'Shared meanings' }) });
  await expect(section).toBeVisible();
  await expect(section.getByRole('checkbox', { name: 'Help improve meanings for everyone' })).not.toBeChecked();
  await expect(section.getByRole('checkbox', { name: 'Help improve meanings for everyone' })).toBeDisabled();
  await expect(section).toContainText('Not available in this build.');
  await expect(section.getByRole('button', { name: /Delete what I shared/ })).toHaveCount(0);

  expect(requests.filter((u) => /crowd|\/v1\/(votes|delete)|manifest\.json/.test(new URL(u).pathname + new URL(u).host))).toEqual([]);
});
