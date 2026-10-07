import { test, expect } from '@playwright/test';

/**
 * Book files live in the BlobStore, addressed by their SHA-256. Adding a file
 * that is already in the library says so and adds nothing; the book and its
 * file survive a reload.
 */
test('importing the same EPUB twice says it is already in the library and stores it once', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Try the sample book' }).click();
  await expect(page.locator('.book-card')).toHaveCount(1, { timeout: 15000 });

  // The same bytes the sample button fetched, chosen through the file picker.
  await page.locator('input[type=file][multiple]').setInputFiles('public/sample-book.epub');
  await expect(page.locator('.library__error')).toContainText('is already in your library');
  await expect(page.locator('.book-card')).toHaveCount(1);

  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.locator('.book-card')).toHaveCount(1);

  // One blob, owned by the one book; nothing left in the old table.
  const stored = await page.evaluate(async () => {
    const open = (name: string) =>
      new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open(name);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    const count = (db: IDBDatabase, store: string) =>
      new Promise<number>((resolve, reject) => {
        const req = db.transaction(store).objectStore(store).count();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    const main = await open('arabic-reader');
    const blobs = await open('arabic-reader-blobs');
    return { legacy: await count(main, 'bookFiles'), blobs: await count(blobs, 'blobs'), index: await count(blobs, 'blobIndex') };
  });
  expect(stored).toEqual({ legacy: 0, blobs: 1, index: 1 });
});
