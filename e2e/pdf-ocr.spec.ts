import { test, expect, type Page } from '@playwright/test';
import { makePdf } from '../src/pdf/testPdf';

/**
 * Tapping a word on a scanned PDF page (src/pdf/ocr). The engine here is an address the reader added,
 * answered by the test, so the whole path runs without Windows: crop, engine, picked word, popup.
 */
test.use({ viewport: { width: 1440, height: 900 } });

const ENGINE_URL = 'http://ocr.test/ocr';

async function routeEngine(page: Page, requests: string[]) {
  await page.route(`${ENGINE_URL}**`, async (route) => {
    requests.push(route.request().url());
    // Put the word in the middle of the crop, where the tap is: the PNG header holds the crop's size.
    const png = route.request().postDataBuffer();
    const [width, height] = png && png.length > 24 ? [png.readUInt32BE(16), png.readUInt32BE(20)] : [400, 200];
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      // The browser asks first (a PNG body is not a simple request), so the address must answer that too.
      headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' },
      body: JSON.stringify({ words: [{ text: 'المدرسة،', x: width / 2 - 110, y: height / 2 - 30, w: 220, h: 60 }] }),
    });
  });
}

async function addScan(page: Page) {
  await page.goto('/');
  await page.waitForSelector('.navbar__settings', { timeout: 15000 });
  await page.setInputFiles('.library__actions input[type=file]', { name: 'scan.pdf', mimeType: 'application/pdf', buffer: Buffer.from(makePdf([{ image: true }, { image: true }])) });
  await expect(page.locator('.book-card')).toHaveCount(1, { timeout: 30000 });
}

test('a tap on a scanned page is read by the chosen engine and opens the dictionary', async ({ page }) => {
  const requests: string[] = [];
  await routeEngine(page, requests);
  await page.addInitScript((url) => {
    localStorage.setItem('arabic-reader:pdfOcr', JSON.stringify({ engineId: 'custom:t', custom: [{ id: 'custom:t', name: 'Test engine', url }] }));
  }, ENGINE_URL);
  await addScan(page);
  await page.locator('.book-card__open').first().click();
  await expect(page.locator('.reader__footer')).toContainText('Page 1 of 2', { timeout: 20000 });
  await expect(page.locator('.pdfp-chip')).toContainText('Scanned page');

  const layer = page.locator('.pdfp-page[data-page="1"] .pdfp-text');
  const box = (await layer.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 3);

  await expect(page.locator('.dict-popup')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('.dict-popup')).toContainText('المدرسة');
  await expect(page.locator('.pdfp-chip')).toContainText('Test engine');
  expect(requests[0]).toContain('lang=ar');
});

test('with no engine the chip says so, and Settings can add one of your own', async ({ page }) => {
  const requests: string[] = [];
  await routeEngine(page, requests);
  await addScan(page);
  await page.locator('.book-card__open').first().click();
  await expect(page.locator('.reader__footer')).toContainText('Page 1 of 2', { timeout: 20000 });
  const layer = page.locator('.pdfp-page[data-page="1"] .pdfp-text');
  const box = (await layer.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 3);
  // In a browser the offline reading engine is the default, and it needs its one-time download first.
  await expect(page.locator('.pdfp-chip--warn')).toContainText('Download the reading model');

  await page.getByRole('button', { name: 'Library' }).first().click();
  await page.click('.navbar__settings');
  const section = page.locator('.settings-section', { hasText: 'Text recognition' });
  // Offline reading (needs its download) and Claude (needs a key) are listed; neither is ready yet.
  await expect(section.locator('.ocr-engine')).toHaveCount(2);
  await expect(section.locator('.ocr-engine').nth(0)).toContainText('Claude (AI vision)');
  await expect(section.locator('.ocr-engine').nth(1)).toContainText('Offline reading');
  await section.getByRole('button', { name: '+ Add your own engine' }).click();
  await section.getByPlaceholder('My Tesseract server').fill('Local test');
  await section.getByPlaceholder('http://localhost:8080/ocr').fill('https://ocr.test/ocr');
  await expect(section).toContainText('on the internet');
  await section.getByRole('button', { name: 'Add engine' }).click();
  await expect(section.locator('.ocr-engine--on')).toContainText('Local test');
  await expect(section.locator('.ocr-engine--on .ocr-pill')).toContainText('Sends images out');
  await section.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(section.locator('.ocr-engine')).toHaveCount(2);
});

test('a read that is not a word is flagged, offers corrections, and a pick looks the word up', async ({ page }) => {
  await page.route(`${ENGINE_URL}**`, async (route) => {
    const png = route.request().postDataBuffer();
    const [width, height] = png && png.length > 24 ? [png.readUInt32BE(16), png.readUInt32BE(20)] : [400, 200];
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' },
      // Every read, however close the look, gives the misread word: the final ة as ه.
      body: JSON.stringify({ words: [{ text: 'المدرسه', x: width / 2 - 100, y: height / 2 - 30, w: 200, h: 60 }] }),
    });
  });
  await page.addInitScript((url) => {
    localStorage.setItem('arabic-reader:pdfOcr', JSON.stringify({ engineId: 'custom:t', custom: [{ id: 'custom:t', name: 'Test engine', url }] }));
  }, ENGINE_URL);
  await addScan(page);
  await page.locator('.book-card__open').first().click();
  await expect(page.locator('.reader__footer')).toContainText('Page 1 of 2', { timeout: 20000 });
  const box = (await page.locator('.pdfp-page[data-page="1"] .pdfp-text').boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 3);

  const popup = page.locator('.dict-popup');
  await expect(popup).toBeVisible({ timeout: 30000 });
  await expect(popup).toContainText('Not a known word');
  const alternative = popup.locator('.dict-popup__alt').first();
  await expect(alternative).toContainText('المدرسة');
  await alternative.click();
  await expect(popup.locator('.dict-popup__word-text')).toHaveText('المدرسة');
  await expect(popup).toContainText('Corrected');

  // The fix is remembered: the same word, tapped again, comes up right with no warning.
  await page.keyboard.press('Escape');
  await expect(popup).toBeHidden();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 3);
  await expect(popup).toContainText('Remembered from your earlier correction', { timeout: 30000 });
  await expect(popup.locator('.dict-popup__word-text')).toHaveText('المدرسة');
});

test('a second opinion is asked only when the first read is not a word, and the dictionary decides', async ({ page }) => {
  const answer = (text: string) => async (route: import('@playwright/test').Route) => {
    const png = route.request().postDataBuffer();
    const [width, height] = png && png.length > 24 ? [png.readUInt32BE(16), png.readUInt32BE(20)] : [400, 200];
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' },
      body: JSON.stringify({ words: [{ text, x: width / 2 - 100, y: height / 2 - 30, w: 200, h: 60 }] }),
    });
  };
  await page.route('http://ocr.test/first**', answer('المدرسه'));
  await page.route('http://ocr.test/second**', answer('المدرسة'));
  await page.addInitScript(() => {
    localStorage.setItem(
      'arabic-reader:pdfOcr',
      JSON.stringify({
        engineId: 'custom:a',
        fallbackId: 'custom:b',
        custom: [
          { id: 'custom:a', name: 'First engine', url: 'http://ocr.test/first' },
          { id: 'custom:b', name: 'Second engine', url: 'http://ocr.test/second' },
        ],
      })
    );
  });
  await addScan(page);
  await page.locator('.book-card__open').first().click();
  await expect(page.locator('.reader__footer')).toContainText('Page 1 of 2', { timeout: 20000 });
  const box = (await page.locator('.pdfp-page[data-page="1"] .pdfp-text').boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 3);
  const popup = page.locator('.dict-popup');
  await expect(popup.locator('.dict-popup__word-text')).toHaveText('المدرسة', { timeout: 30000 });
  await expect(popup).toContainText('by Second engine');
  await expect(popup).not.toContainText('Not a known word');
});

test('the offline reading model downloads once from Settings and the engine becomes ready', async ({ page }) => {
  // A stand-in for the model files: this checks the download, keeping and status, not the reading itself.
  await page.route('**/arabic/rec_model.onnx', (route) => route.fulfill({ status: 200, contentType: 'application/octet-stream', headers: { 'access-control-allow-origin': '*' }, body: Buffer.alloc(4096, 1) }));
  await page.route('**/arabic/charset.json', (route) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '["ا","ب"]' }));
  await page.goto('/');
  await page.waitForSelector('.navbar__settings', { timeout: 15000 });
  await page.click('.navbar__settings');
  const section = page.locator('.settings-section', { hasText: 'Text recognition' });
  const engine = section.locator('.ocr-engine', { hasText: 'Offline reading' });
  await expect(engine).toContainText('Not available');
  await section.getByRole('button', { name: /^Download/ }).click();
  await expect(section.locator('.ocr-pill--ok', { hasText: 'Downloaded' })).toBeVisible({ timeout: 15000 });
  await expect(engine).toContainText('Ready');
  await section.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(engine).toContainText('Not available');
});
