import { test, expect, type Page } from '@playwright/test';

test.use({ viewport: { width: 1440, height: 900 } });

/** The original reader, with Al-Wasīṭ switched on (seeded only when no preferences exist yet). */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const key = 'arabic-reader:preferences';
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ quietReaderEnabled: false, enabledProviderIds: ['aramorph', 'alwasit'] }));
  });
});

const vocab = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<{ bookId: string; surfaceForm: string }[]>((resolve, reject) => {
        const open = indexedDB.open('arabic-reader');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const req = open.result.transaction('vocabulary', 'readonly').objectStore('vocabulary').getAll();
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        };
      })
  );

test('the Dictionary screen searches, switches dictionaries, browses nearby headwords and saves', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('.navbar__settings', { timeout: 15000 });
  await page.locator('.navbar__item', { hasText: 'Dictionary' }).click();
  const input = page.getByRole('textbox', { name: 'Search the dictionary' });
  await input.fill('كتب');
  await input.press('Enter');

  const tabs = page.getByRole('navigation', { name: 'Dictionaries' });
  await expect(tabs.getByRole('button', { name: /^All \d+$/ })).toBeVisible({ timeout: 20000 });
  await tabs.getByRole('button', { name: /^Al-Wasīṭ \d+$/ }).click();

  const nearby = page.getByRole('complementary', { name: 'Nearby in Al-Wasīṭ' });
  await expect(nearby.locator('[aria-current="true"]')).toHaveText('كتب', { timeout: 15000 });
  await nearby.getByRole('button', { name: 'كتف', exact: true }).click();
  await expect(input).toHaveValue('كتف');
  await expect(nearby.locator('[aria-current="true"]')).toHaveText('كتف', { timeout: 15000 });

  // Alt+Left goes back to the previous word.
  await page.locator('.dpage__main').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Alt+ArrowLeft');
  await expect(input).toHaveValue('كتب');

  await page.locator('.dict-popup--page .dict-popup__save').click();
  await expect(page.locator('.dict-popup--page .dict-popup__save')).toHaveText('✓ Vocabulary');
  await expect.poll(async () => (await vocab(page)).filter((v) => v.surfaceForm === 'كتب').map((v) => v.bookId)).toEqual(['dictionary']);
});

test('the popup opens the word in the full-page dictionary, and Back returns to the book', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.waitForSelector('text=Try the sample book', { timeout: 10000 });
  await page.click('text=Try the sample book');
  await page.waitForSelector('.book-card', { timeout: 15000 });
  await page.click('.book-card');
  await page.waitForSelector('.reader__epub iframe', { timeout: 30000 });
  await page.waitForTimeout(2000);
  const frame = page.frames().find((f) => f !== page.mainFrame())!;
  const word = await frame.evaluate(() => {
    const el = document.querySelectorAll('p .ar-word')[0] as HTMLElement;
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    return el.dataset.word ?? el.textContent ?? '';
  });
  await page.getByRole('button', { name: 'Open in full page' }).click();

  await expect(page.locator('.dpage')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Search the dictionary' })).toHaveValue(word);
  await expect(page.locator('.dict-popup--page .dict-popup__word')).toContainText(word);
  await page.getByRole('button', { name: 'Back to book' }).click();
  await expect(page.locator('.reader__epub iframe')).toBeVisible({ timeout: 30000 });
});
