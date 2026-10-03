import { test, expect } from '@playwright/test';
import { useOriginalReader } from './originalReader';

test.beforeEach(async ({ page }) => useOriginalReader(page));

/**
 * Clean popup layout: when Al-Wasit returns more than one entry (a word with several
 * roots), a dock of labelled tabs, one per Al-Wasit entry, jumps between them and
 * lights the one being read. It is visible as soon as the popup opens.
 */
test('the Al-Wasit dock jumps between entries', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.waitForSelector('text=Try the sample book', { timeout: 10000 });
  await page.click('.navbar__settings');
  await page.locator('.settings-row--dict').nth(1).locator('input').check();
  await page.waitForTimeout(3000);
  await page.click('.settings-panel__close');
  await page.click('text=Try the sample book');
  await page.waitForSelector('.book-card', { timeout: 15000 });
  await page.click('.book-card');
  await page.waitForSelector('.reader__epub iframe', { timeout: 30000 });
  await page.waitForTimeout(2500);

  const frame = page.frames().find((f) => f !== page.mainFrame())!;
  const count = await frame.evaluate(() => document.querySelectorAll('p .ar-word').length);
  let found = false;
  for (let i = 0; i < Math.min(count, 60) && !found; i++) {
    await frame.evaluate((n) => {
      document.querySelectorAll('p .ar-word')[n].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    }, i);
    await page.waitForSelector('.dict-popup', { timeout: 8000 });
    await page.waitForTimeout(1500);
    found = (await page.locator('.dict-popup__dock-tab').count()) >= 2;
    if (!found) await page.click('.dict-popup__close');
  }
  expect(found, 'a word with two or more Al-Wasit entries turns up in the sample book').toBe(true);

  // The dock is there from the start, before any scrolling.
  await expect(page.locator('.dict-popup__dock--on')).toBeVisible();
  const tabs = page.locator('.dict-popup__dock-tab');
  await expect(tabs.first()).toContainText(/\S/);

  // Pressing a tab scrolls that entry to the top and lights the tab.
  await tabs.first().click();
  await expect(tabs.first()).toHaveAttribute('aria-current', 'true');
  await tabs.nth(1).click();
  await expect(tabs.nth(1)).toHaveAttribute('aria-current', 'true', { timeout: 5000 });
  await page.locator('.dict-popup').screenshot({ path: 'test-results/entry-dock.png' });
});
