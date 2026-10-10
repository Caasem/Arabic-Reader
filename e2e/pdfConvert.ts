import type { Page } from '@playwright/test';

/** PDFs open as pages by default; tests that need the reflowed text turn on Settings → PDF → Convert first. */
export async function turnOnPdfConvert(page: Page): Promise<void> {
  await page.click('.navbar__settings');
  await page.waitForSelector('.settings-panel', { timeout: 5000 });
  const box = page.locator('.settings-row', { hasText: 'Convert PDFs to text when adding' }).locator('input[type=checkbox]');
  await box.scrollIntoViewIfNeeded();
  await box.check();
  await page.click('.settings-panel__close');
}
