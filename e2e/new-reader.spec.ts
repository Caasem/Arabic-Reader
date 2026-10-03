import { test, expect, type Page } from '@playwright/test';
import JSZip from 'jszip';

/**
 * The redesigned reader (src/quietReader), on by default: clean text, one dock,
 * the dictionary in the margin, a book drawer, and the display sheet.
 */
test.use({ viewport: { width: 1440, height: 900 } });

async function openSample(page: Page) {
  await page.goto('/');
  await page.waitForSelector('.navbar__settings', { timeout: 15000 });
  await page.locator('.navbar__item', { hasText: 'Library' }).click();
  await page.waitForSelector('text=Try the sample book', { timeout: 10000 });
  if ((await page.locator('.book-card').count()) === 0) await page.click('text=Try the sample book');
  await page.locator('.book-card').first().click();
  await page.waitForSelector('.qr-chapter .ar-word', { timeout: 15000 });
}

const dock = (page: Page, name: string) => page.locator('.qr-dock').getByRole('button', { name, exact: true });
const chapterTitle = (page: Page) => page.locator('.qr-header__chapter');

test('opens books as clean text with one dock, and turns pages and chapters', async ({ page }) => {
  await openSample(page);
  await expect(page.locator('.qr-header__book')).toHaveText('قرية الفتى القوي');
  await expect(chapterTitle(page)).toHaveText('الفصل الأول: القرية');
  for (const name of ['Contents', 'Search', 'Marks', 'Words', 'Display', 'Levels', 'Pomodoro timer', 'Focus']) {
    await expect(dock(page, name)).toBeVisible();
  }
  await expect(page.locator('.qr-where--right')).toContainText('Page 1 of');

  // Right-to-left: the left arrow is "next".
  await page.keyboard.press('ArrowLeft');
  await expect(chapterTitle(page)).toHaveText('الفصل الثاني: المدرسة');
  await page.keyboard.press('ArrowRight');
  await expect(chapterTitle(page)).toHaveText('الفصل الأول: القرية');
  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(chapterTitle(page)).toHaveText('الفصل الثاني: المدرسة');
});

test('the display sheet changes the page, and a book can switch to its original layout and back', async ({ page }) => {
  await openSample(page);
  await dock(page, 'Display').click();
  const sheet = page.getByRole('dialog', { name: 'Display' });
  await expect(sheet).toBeVisible();

  const fontSize = () => page.locator('.qr-text').evaluate((el) => getComputedStyle(el).fontSize);
  await expect.poll(fontSize).toBe('22px');
  await sheet.getByRole('button', { name: 'Larger text' }).click();
  await expect(sheet).toContainText('110%');
  await expect.poll(fontSize).toBe('24.2px');

  await sheet.getByRole('button', { name: /Night$/ }).click();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');
  await sheet.getByRole('button', { name: /Light$/ }).click();

  await sheet.getByRole('button', { name: 'Scrolling' }).click();
  await expect(page.locator('.qr-stage')).toHaveClass(/qr-stage--scroll/);
  await expect(page.locator('.qr-where--right')).toContainText('Chapter 1 of 3');
  await expect(sheet.getByRole('button', { name: '2 columns' })).toBeDisabled();

  await sheet.getByRole('button', { name: 'Scroll all' }).click();
  await expect(page.locator('.qr-chapter')).toHaveCount(3);

  await sheet.getByRole('button', { name: 'Paged' }).click();
  await sheet.getByRole('button', { name: 'Original layout' }).click();
  await page.waitForSelector('.reader__epub iframe', { timeout: 15000 });
  await page.getByRole('button', { name: 'Clean text' }).click();
  await page.waitForSelector('.qr-chapter .ar-word', { timeout: 15000 });
});

test('a word opens the usual dictionary popup, in Focus too, and saving it colours it in the text', async ({ page }) => {
  await openSample(page);
  const word = page.locator('.qr-text .ar-word', { hasText: 'تُشْرِقُ' }).first();
  await word.click();
  const popup = page.locator('.dict-popup');
  await expect(popup).toBeVisible();
  await expect(popup.locator('.dict-popup__word')).toContainText('تُشْرِقُ');
  await expect(popup.locator('.dict-popup__group-header').first()).toContainText('English', { timeout: 15000 });
  await expect(word).toHaveClass(/qr-word--active/);

  await popup.locator('.dict-popup__save').click();
  await expect(popup.locator('.dict-popup__save')).toHaveClass(/dict-popup__save--saved/);
  await expect(word).toHaveClass(/ar-word--saved/);
  await popup.locator('.dict-popup__close').click();
  await expect(popup).toHaveCount(0);
  await expect(word).not.toHaveClass(/qr-word--active/);

  // Focus hides the reader's chrome, not the dictionary.
  await dock(page, 'Focus').click();
  await expect(page.locator('.qr-focus-pill')).toBeVisible();
  await page.locator('.qr-text .ar-word', { hasText: 'الشَّمْسَ' }).first().click();
  await expect(page.locator('.dict-popup')).toBeVisible();
  await expect(page.locator('.dict-popup__group-header').first()).toContainText('English', { timeout: 15000 });
});

test('the book drawer: contents, search, bookmarks, highlights and saved words', async ({ page }) => {
  await openSample(page);

  await dock(page, 'Contents').click();
  const drawer = page.getByRole('complementary', { name: 'Book' });
  await expect(drawer.locator('.qr-chapter-row')).toHaveCount(3);
  await drawer.locator('.qr-chapter-row').nth(2).click();
  await expect(chapterTitle(page)).toHaveText('الفصل الثالث: الطريق إلى البحر');

  await drawer.getByRole('tab', { name: 'Search' }).click();
  await drawer.getByRole('searchbox', { name: 'Search' }).fill('كتاب');
  await expect(drawer.locator('.qr-results-head__summary')).toContainText('2 matches');
  await drawer.getByRole('button', { name: 'Same root' }).click();
  await expect(drawer.locator('.qr-results-head__summary')).toContainText('root', { timeout: 20000 });
  await drawer.locator('.qr-result').first().click();
  await expect(chapterTitle(page)).toHaveText('الفصل الثاني: المدرسة');

  await drawer.getByRole('tab', { name: 'Marks' }).click();
  await drawer.getByRole('button', { name: 'Bookmark this page' }).click();
  await expect(page.locator('.qr-header').getByRole('button', { name: 'Bookmark this page' })).toHaveAttribute('aria-pressed', 'true');
  await expect(drawer.locator('.qr-mark')).toHaveCount(1);
  await expect(drawer.locator('.qr-mark')).toContainText('this page');

  // Select the first paragraph's opening words, then pick a colour.
  await page.evaluate(() => {
    const p = document.querySelector('.qr-chapter p')!;
    const range = document.createRange();
    range.setStart(p.firstChild!.firstChild ?? p.firstChild!, 0);
    range.setEnd(p.children[2]?.firstChild ?? p.lastChild!, 1);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
    document.querySelector('.qr-stage')!.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
  });
  await page.getByRole('button', { name: 'Highlight green' }).click();
  await expect(drawer.locator('.qr-hl-card')).toHaveCount(1);
  await drawer.getByRole('button', { name: 'Edit note' }).click();
  await drawer.getByRole('textbox', { name: 'Note' }).fill('The girl goes to school');
  await drawer.getByRole('button', { name: 'Save note' }).click();
  await expect(drawer.locator('.qr-hl-card__note')).toHaveText('The girl goes to school');

  // Save a word, then find it under Words.
  await page.locator('.qr-text .ar-word', { hasText: 'الْمَدْرَسَةِ' }).first().click();
  const popup = page.locator('.dict-popup');
  await expect(popup.locator('.dict-popup__group-header').first()).toContainText('English', { timeout: 15000 });
  await popup.locator('.dict-popup__save').click();
  await expect(popup.locator('.dict-popup__save')).toHaveClass(/dict-popup__save--saved/);
  await popup.locator('.dict-popup__close').click();
  await drawer.getByRole('tab', { name: 'Words' }).click();
  await expect(drawer.locator('.qr-word-row')).toHaveCount(1);
  await expect(drawer.locator('.qr-word-row__word')).toHaveText('الْمَدْرَسَةِ');
});

test('focus, the timer, and vocab levels', async ({ page }) => {
  await openSample(page);

  await dock(page, 'Focus').click();
  await expect(page.locator('.qr-focus-pill')).toBeVisible();
  await expect(page.locator('.qr-header')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.locator('.qr-header')).toBeVisible();

  await dock(page, 'Pomodoro timer').click();
  const timer = page.getByRole('dialog', { name: 'Pomodoro' });
  await timer.getByRole('button', { name: 'Start' }).click();
  await expect(timer.getByRole('button', { name: 'Pause' })).toBeVisible();
  await expect(dock(page, 'Pomodoro timer')).toContainText(/\d\d:\d\d/);
  await timer.getByRole('button', { name: 'Stop' }).click();
  await expect(timer.getByRole('button', { name: 'Start' })).toBeVisible();
  await page.keyboard.press('Escape');

  await dock(page, 'Levels').click();
  const levels = page.getByRole('complementary', { name: 'Vocab levels' });
  await expect(levels).toBeVisible();
  const enable = levels.getByRole('button', { name: 'Turn on vocab levels' });
  if (await enable.isVisible()) await enable.click();
  await levels.getByRole('button', { name: 'Beginner' }).click();
  await expect(levels.locator('.qr-levels__row').first()).toBeVisible({ timeout: 20000 });
});

async function buildNotedEpub(): Promise<Buffer> {
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  zip.file(
    'META-INF/container.xml',
    '<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'
  );
  zip.file(
    'OEBPS/content.opf',
    `<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>حواش</dc:title><dc:language>ar</dc:language><dc:identifier id="id">urn:uuid:notes-0001</dc:identifier></metadata><manifest><item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="c1"/></spine></package>`
  );
  zip.file(
    'OEBPS/c1.xhtml',
    `<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" dir="rtl"><body><h1>الفصل</h1><p>وَخَيْرُ جَلِيسٍ<a epub:type="noteref" href="#n1">١</a> كِتَابُ.</p><aside id="n1" epub:type="footnote"><p>مِنْ بَيْتٍ لِلْمُتَنَبِّي.</p></aside></body></html>`
  );
  return zip.generateAsync({ type: 'nodebuffer', mimeType: 'application/epub+zip' });
}

test('footnotes open where their marker is, with a way to the note in the book', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('.navbar__settings', { timeout: 15000 });
  await page.setInputFiles('.library__actions input[type=file]', { name: 'notes.epub', mimeType: 'application/epub+zip', buffer: await buildNotedEpub() });
  await page.waitForSelector('.book-card', { timeout: 15000 });
  await page.click('.book-card');
  await page.waitForSelector('.qr-chapter .ar-word', { timeout: 15000 });

  await page.getByRole('button', { name: 'Note ١' }).click();
  const note = page.getByRole('dialog', { name: 'Note ١' });
  await expect(note).toContainText('مِنْ بَيْتٍ لِلْمُتَنَبِّي');
  await note.getByRole('button', { name: 'Go to note' }).click();
  await expect(note).toHaveCount(0);
});

test('Alt+D, Alt+S and Alt+V open their palettes over the new reader, and jumps land in the text', async ({ page }) => {
  await openSample(page);

  // Alt+D: the dictionary search, as before.
  await page.keyboard.press('Alt+d');
  await expect(page.locator('.dsearch')).toBeVisible();
  await page.keyboard.press('Alt+d');
  await expect(page.locator('.dsearch')).toHaveCount(0);

  // Alt+S: the book search palette; Enter jumps to the match in the clean text.
  await page.keyboard.press('Alt+s');
  await expect(page.locator('.bsearch')).toBeVisible();
  await page.keyboard.type('مكتبة');
  await expect(page.locator('.bsearch__hit').first()).toBeVisible({ timeout: 20000 });
  await page.locator('.bsearch__input').press('Enter');
  await expect(page.locator('.bsearch')).toHaveCount(0);
  await expect(chapterTitle(page)).toHaveText('الفصل الثاني: المدرسة');
  // The drawer is still there for the same searches.
  await expect(page.locator('.qr-drawer')).toHaveCount(0);

  // Alt+V: the saved-words drawer; a word saved here jumps back to its place.
  await page.locator('.qr-text .ar-word', { hasText: 'السَّمَاءِ' }).first().click();
  const popup = page.locator('.dict-popup');
  await expect(popup.locator('.dict-popup__group-header').first()).toContainText('English', { timeout: 15000 });
  await popup.locator('.dict-popup__save').click();
  await popup.locator('.dict-popup__close').click();
  await page.keyboard.press('ArrowRight');
  await expect(chapterTitle(page)).toHaveText('الفصل الأول: القرية');
  await page.keyboard.press('Alt+v');
  await expect(page.locator('.bvocab')).toBeVisible();
  await page.locator('.bvocab__row-main').first().click();
  await page.getByRole('button', { name: 'Jump to it' }).click();
  await expect(page.locator('.bvocab')).toHaveCount(0);
  await expect(chapterTitle(page)).toHaveText('الفصل الثاني: المدرسة');
});
