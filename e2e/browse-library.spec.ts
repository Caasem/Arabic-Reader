import { test, expect, type Page } from '@playwright/test';

/** Browse library: Text and PDF buttons, volumes, double-click, title preview and the quality badge, against a mocked collection. */
test.use({ viewport: { width: 1280, height: 900 } });

const DATASET = 'https://huggingface.co/datasets/ieasybooks-org/waqfeya-library/resolve/main/';

const CLEAN = 'ذهب الولد الصغير إلى المدرسة في الصباح الباكر مع أخيه الكبير وكان الطريق طويلا بين البيوت القديمة والأشجار العالية ثم رجع إلى البيت بعد الظهر وقرأ كتابا جديدا عن الحياة والناس في القرية';
const GIBBERISH = 'كخزقص ضثغظف ططكذش ذغظكخ ثثقصض غظفكح خزقضث ظفكحج صضثغط ذشغظك قصضثغ فكحجخ زقضثظ طكذشغ ثغظفك حجخزق ضثغطظ كذشغظ فكحجز';

function pages(text: string): string {
  return ['عنوان الكتاب', text, `${text} ثانية`].join('\nPAGE_SEPARATOR\n');
}

const FILES: Record<string, string> = {
  'txt/a/single.txt': pages(CLEAN),
  'txt/b/v1.txt': pages(GIBBERISH),
  'txt/b/v2.txt': pages(`${GIBBERISH} ٢`),
  'txt/b/v3.txt': pages(`${GIBBERISH} ٣`),
};

const INDEX = [
  'category\tauthor\ttitle\tpages\tvolumes\tpdf_paths\ttxt_paths\tdocx_paths',
  "علوم\tمؤلف أول\tكتاب واحد\t3\t1\t['./pdf/a/single.pdf']\t['./txt/a/single.txt']\t[]",
  "تاريخ\tمؤلف ثان\tموسوعة الأجزاء\t9\t3\t['./pdf/b/v1.pdf', './pdf/b/v2.pdf', './pdf/b/v3.pdf']\t['./txt/b/v1.txt', './txt/b/v2.txt', './txt/b/v3.txt']\t[]",
].join('\n');

async function mockCollection(page: Page) {
  await page.route(/huggingface\.co\/datasets\/ieasybooks-org\/.*\/resolve\/main\//, async (route) => {
    const url = decodeURIComponent(route.request().url());
    const path = url.slice(url.indexOf('/resolve/main/') + '/resolve/main/'.length);
    const body = path === 'index.tsv' ? INDEX : path.startsWith('txt/') ? FILES[path] : undefined;
    if (body === undefined) return route.fulfill({ status: path.startsWith('pdf/') ? 200 : 404, headers: { 'access-control-allow-origin': '*', 'content-length': '1048576' }, body: '' });
    await route.fulfill({
      status: 200,
      headers: { 'access-control-allow-origin': '*', 'content-type': 'text/plain; charset=utf-8', 'content-length': String(Buffer.byteLength(body)) },
      body: route.request().method() === 'HEAD' ? '' : body,
    });
  });
}

async function openBrowse(page: Page) {
  await mockCollection(page);
  await page.goto('/');
  await page.waitForSelector('.navbar__settings', { timeout: 15000 });
  await page.getByRole('button', { name: 'Browse library' }).first().click();
  await expect(page.locator('.browse__row')).toHaveCount(2, { timeout: 20000 });
}

const row = (page: Page, title: string) => page.locator('.browse__row', { hasText: title });

test('a single-volume book is added with one press of Text, and its size shows on the buttons', async ({ page }) => {
  await openBrowse(page);
  const single = row(page, 'كتاب واحد');
  await expect(single.getByRole('button', { name: /Text/ })).toContainText('KB', { timeout: 10000 });
  await expect(single.getByRole('button', { name: /PDF/ })).toContainText('MB');
  await single.getByRole('button', { name: /Text/ }).click();
  await expect(single.getByRole('button', { name: 'Added ✓' })).toBeVisible({ timeout: 30000 });
  await page.keyboard.press('Escape');
  await expect(page.locator('.book-card', { hasText: 'كتاب واحد' })).toHaveCount(1);
});

test('a multi-volume book drops its volumes from the button; a double-click adds the rest on a shelf', async ({ page }) => {
  await openBrowse(page);
  const multi = row(page, 'موسوعة الأجزاء');
  await multi.getByRole('button', { name: /Text/ }).click();
  const menu = multi.getByRole('group', { name: 'Volumes as Text' });
  await expect(menu.getByRole('button')).toHaveText([/All volumes/, /Vol\. 1/, /Vol\. 2/, /Vol\. 3/]);

  await menu.getByRole('button', { name: /Vol\. 2/ }).click();
  await expect(menu.getByRole('button', { name: /Vol\. 2/ })).toContainText('added ✓', { timeout: 30000 });

  await multi.getByRole('button', { name: /Text/ }).dblclick();
  await expect(page.locator('.browse__notice')).toContainText('Added 2 books to the shelf “موسوعة الأجزاء”', { timeout: 30000 });
  await expect(multi.getByRole('button', { name: /Text/ })).toContainText('all added ✓');
  await page.keyboard.press('Escape');
  for (const v of [1, 2, 3]) await expect(page.locator('.book-card', { hasText: `المجلد ${v}` })).toHaveCount(1);
});

test('tapping a title previews the first page, and there is no separate Preview link', async ({ page }) => {
  await openBrowse(page);
  await expect(page.getByRole('button', { name: 'Preview', exact: true })).toHaveCount(0);
  await row(page, 'كتاب واحد').locator('.browse__title').click();
  await expect(row(page, 'كتاب واحد').locator('.browse__preview')).toContainText('ذهب الولد الصغير', { timeout: 15000 });
});

test('tapping an author filters to their books', async ({ page }) => {
  await openBrowse(page);
  await row(page, 'موسوعة الأجزاء').locator('.browse__author').click();
  await expect(page.locator('.browse__row')).toHaveCount(1);
  await page.getByRole('button', { name: 'Show all authors' }).click();
  await expect(page.locator('.browse__row')).toHaveCount(2);
});

test('the quality badge is off until Settings turns it on, then separates clean text from a poor scan', async ({ page }) => {
  await openBrowse(page);
  await page.waitForTimeout(1500);
  await expect(page.locator('.browse__badge')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.evaluate(() => {
    const key = 'arabic-reader:preferences';
    localStorage.setItem(key, JSON.stringify({ ...JSON.parse(localStorage.getItem(key) ?? '{}'), browseShowQuality: true }));
  });
  await page.reload();
  await page.waitForSelector('.navbar__settings', { timeout: 15000 });
  await page.getByRole('button', { name: 'Browse library' }).first().click();
  await expect(row(page, 'كتاب واحد').locator('.browse__badge')).toContainText('Clean', { timeout: 30000 });
  await expect(row(page, 'موسوعة الأجزاء').locator('.browse__badge')).toContainText('Poor scan', { timeout: 30000 });
  await expect(row(page, 'موسوعة الأجزاء').locator('.browse__warn')).toContainText('PDF');
});

test("a Browse book's details offer the volumes not added yet, and adding them completes the set", async ({ page }) => {
  await openBrowse(page);
  const multi = row(page, 'موسوعة الأجزاء');
  await multi.getByRole('button', { name: /Text/ }).click();
  const menu = multi.getByRole('group', { name: 'Volumes as Text' });
  await menu.getByRole('button', { name: /Vol\. 2/ }).click();
  await expect(menu.getByRole('button', { name: /Vol\. 2/ })).toContainText('added ✓', { timeout: 30000 });
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Details for موسوعة الأجزاء — المجلد 2' }).click();
  const next = page.locator('.lib-next');
  await expect(next).toContainText('Volume 2 of 3', { timeout: 20000 });
  await expect(next).toContainText('2 not added yet');
  await expect(next.getByRole('button')).toHaveText([/Add volume 1/, /Add volume 3/]);

  await next.getByRole('button', { name: /Add volume 3/ }).click();
  await expect(next).toContainText('1 not added yet', { timeout: 30000 });
  await next.getByRole('button', { name: /Add volume 1/ }).click();
  await expect(next).toContainText('All 3 volumes are in your library', { timeout: 30000 });
  for (const v of [1, 2, 3]) await expect(page.locator('.book-card', { hasText: `المجلد ${v}` })).toHaveCount(1);
});
