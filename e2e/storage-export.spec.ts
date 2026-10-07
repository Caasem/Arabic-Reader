import { test, expect, type Page } from '@playwright/test';
import os from 'node:os';
import path from 'node:path';

async function addSampleBook(page: Page) {
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Try the sample book' }).click();
  await expect(page.locator('.book-card')).toHaveCount(1, { timeout: 15000 });
}

async function openStorage(page: Page) {
  await page.click('.navbar__settings');
  await page.waitForSelector('.settings-panel', { timeout: 5000 });
  const section = page.locator('.settings-section', { has: page.getByRole('heading', { name: 'Storage', exact: true }) });
  await section.scrollIntoViewIfNeeded();
  return section;
}

test('Remove file only frees the space but keeps the book, and adding the file back restores it', async ({ page }) => {
  await addSampleBook(page);
  const storage = await openStorage(page);

  const row = storage.locator('.storage-item', { hasText: 'Remove file only' }).first();
  await expect(row).toBeVisible({ timeout: 10000 });
  page.once('dialog', (dialog) => void dialog.accept());
  await row.getByRole('button', { name: 'Remove file only' }).click();
  await expect(storage.getByRole('status')).toContainText('Removed the file of');
  await expect(storage.locator('.storage-item', { hasText: 'Remove file only' })).toHaveCount(0);

  await page.keyboard.press('Escape');
  await expect(page.locator('.book-card')).toHaveCount(1); // the book is still in the library
  await expect(page.locator('.book-card--missing')).toHaveCount(1);
  await expect(page.getByText('File not on this device')).toBeVisible();

  // Adding the same file back (the sample is public) makes the book readable again.
  await page.locator('input[type=file][multiple]').setInputFiles('public/sample-book.epub');
  await expect(page.locator('.book-card--missing')).toHaveCount(0);
});

test('Export everything, then import it into a fresh profile: the book and its file come back', async ({ page, browser }, testInfo) => {
  await addSampleBook(page);
  const storage = await openStorage(page);

  const download = page.waitForEvent('download');
  await storage.getByRole('button', { name: 'Export everything' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^arabic-reader-export-\d{4}-\d{2}-\d{2}\.zip$/);
  const saved = path.join(os.tmpdir(), `ar-e2e-${testInfo.workerIndex}-${Date.now()}.zip`);
  await file.saveAs(saved);
  await expect(storage.getByRole('status')).toContainText('Exported');

  // A new, empty browser profile.
  const fresh = await browser.newContext({ storageState: 'e2e/.auth/returning-user.json', viewport: { width: 1280, height: 900 } });
  try {
    const page2 = await fresh.newPage();
    await page2.goto('/', { waitUntil: 'networkidle' });
    await expect(page2.locator('.book-card')).toHaveCount(0);

    const storage2 = await openStorage(page2);
    await storage2.locator('input[type=file][accept*=".zip"]').setInputFiles(saved);
    await expect(storage2.getByRole('status')).toContainText('Restored');
    await expect(storage2.getByRole('status')).toContainText('book file');

    await page2.keyboard.press('Escape');
    await expect(page2.locator('.book-card')).toHaveCount(1);
    await expect(page2.locator('.book-card--missing')).toHaveCount(0);
  } finally {
    await fresh.close();
  }
});
