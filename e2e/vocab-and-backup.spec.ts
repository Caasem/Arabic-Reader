import { test, expect } from '@playwright/test';
import fs from 'node:fs';

test('sentence context, quick-add shortcut, review grading, and backup export/import', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('.navbar__settings', { timeout: 10000 });

  await page.click('.navbar__settings');
  await page.waitForSelector('.settings-panel', { timeout: 5000 });
  await page.locator('.settings-toggle', { hasText: 'Capture sentence context' }).locator('input').check();
  await page.locator('.settings-toggle', { hasText: 'Quick-add shortcut' }).locator('input').check();
  await page.waitForTimeout(300);
  await page.click('.settings-panel__close');

  await page.locator('.navbar__item', { hasText: 'Library' }).click();
  await page.waitForSelector('text=Try the sample book', { timeout: 10000 });
  await page.click('text=Try the sample book');
  await page.waitForSelector('.book-card', { timeout: 15000 });
  await page.click('.book-card');
  await page.waitForSelector('.reader__epub iframe', { timeout: 15000 });
  await page.waitForTimeout(1500);

  const frame = page.frames().find((f) => f !== page.mainFrame())!;

  await frame.evaluate(() => {
    document.querySelector('p .ar-word')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
  await page.waitForSelector('.dict-popup', { timeout: 8000 });
  await page.waitForTimeout(600);
  await expect(page.locator('.dict-popup__sentence')).toHaveCount(1);

  // Quick-add shortcut: Ctrl+Shift+A saves without clicking "+ Add".
  await page.keyboard.down('Control');
  await page.keyboard.down('Shift');
  await page.keyboard.press('A');
  await page.keyboard.up('Shift');
  await page.keyboard.up('Control');
  await page.waitForTimeout(300);
  const toastText = await page.locator('.reader__quick-add-toast').textContent().catch(() => null);
  expect(toastText).toContain('added to vocabulary');
  await page.click('.dict-popup__close');

  await page.locator('.navbar__item', { hasText: 'Vocabulary' }).click();
  await page.waitForSelector('.vocab-card', { timeout: 8000 });
  expect(await page.locator('.vocab-card').count()).toBeGreaterThanOrEqual(1);
  await expect(page.locator('.vocab-card__sentence').first()).toBeVisible();

  // A freshly-saved word should be due for review immediately.
  await page.locator('.navbar__item', { hasText: 'Review' }).click();
  await page.waitForSelector('.review__card, .review__empty', { timeout: 8000 });
  await expect(page.locator('.review__card')).toHaveCount(1);
  await page.click('.review__card');
  await page.waitForSelector('.review__card-back', { timeout: 3000 });
  await page.click('.review__btn--good');
  await page.waitForTimeout(300);

  // Export a backup and confirm it's valid JSON containing the saved item.
  await page.click('.navbar__settings');
  await page.waitForSelector('.settings-panel', { timeout: 5000 });
  const exportBtn = page.locator('.settings-panel').getByText('Export backup');
  await exportBtn.scrollIntoViewIfNeeded();
  const [download] = await Promise.all([page.waitForEvent('download'), exportBtn.click()]);
  const downloadPath = await download.path();
  const backupJson = JSON.parse(fs.readFileSync(downloadPath!, 'utf8'));
  expect(backupJson.vocabulary.length).toBeGreaterThan(0);
  expect(backupJson.formatVersion).toBe(1);

  // Import it back in -- should report success, not error.
  const importBtn = page.locator('.settings-panel').getByText('Import backup');
  await importBtn.scrollIntoViewIfNeeded();
  const [fileChooser] = await Promise.all([page.waitForEvent('filechooser'), importBtn.click()]);
  await fileChooser.setFiles(downloadPath!);
  await page.waitForTimeout(500);
  // BackupControls renders its own status line (.backup-controls__status),
  // not a generic .settings-section__note -- the latter also matches the
  // section's static explainer paragraph, which isn't the dynamic result.
  const importStatus = await page.locator('.settings-panel .backup-controls__status').textContent();
  expect(importStatus?.toLowerCase()).toContain('imported');

  // Anki sync: no server running here -- confirm a graceful "unreachable"
  // failure rather than a crash.
  await page.click('text=Sync to Anki');
  await page.waitForTimeout(1500);
  const ankiStatus = await page
    .locator('.settings-section', { hasText: 'Anki sync' })
    .locator('.settings-section__note')
    .last()
    .textContent();
  expect(ankiStatus?.toLowerCase()).toContain("couldn't reach anki");
});
