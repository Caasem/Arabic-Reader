import { test, expect, type Page } from '@playwright/test';
import { useOriginalReader } from './originalReader';

test.beforeEach(async ({ page }) => useOriginalReader(page));

/** Save the first word of the sample book. */
async function saveAWord(page: Page) {
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.waitForSelector('text=Try the sample book', { timeout: 10000 });
  await page.click('text=Try the sample book');
  await page.waitForSelector('.book-card', { timeout: 15000 });
  await page.click('.book-card');
  await page.waitForSelector('.reader__epub iframe', { timeout: 30000 });
  await page.waitForTimeout(2000);
  const frame = page.frames().find((f) => f !== page.mainFrame())!;
  await frame.evaluate(() => document.querySelectorAll('p .ar-word')[0].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));
  await page.locator('.dict-popup__save').click();
  await expect(page.locator('.dict-popup__save')).toHaveText('✓ Vocabulary');
  await page.locator('.dict-popup__close').click();
}

async function openAnkiSettings(page: Page) {
  await page.click('.navbar__settings');
  const section = page.locator('.settings-section', { hasText: 'Export Anki package' });
  await section.scrollIntoViewIfNeeded();
  return section;
}

test('Sync to Anki creates the note type and adds the saved word through AnkiConnect', async ({ page }) => {
  const actions: string[] = [];
  const added: Record<string, string>[] = [];
  await page.route('http://localhost:8765/**', async (route) => {
    const { action, params } = route.request().postDataJSON();
    actions.push(action);
    const reply = (result: unknown) => route.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ result, error: null }) });
    if (action === 'version') return reply(6);
    if (action === 'deckNames') return reply(['Default']);
    if (action === 'modelNames') return reply(['Basic']);
    if (action === 'addNotes') {
      added.push(...params.notes.map((n: { fields: Record<string, string> }) => n.fields));
      return reply(params.notes.map((_: unknown, i: number) => 500 + i));
    }
    return reply(null);
  });

  await saveAWord(page);
  const section = await openAnkiSettings(page);
  await section.getByRole('button', { name: 'Sync to Anki' }).click();
  await expect(section.locator('.settings-section__note[role=status]')).toContainText('Added 1, updated 0, unchanged 0');
  expect(actions).toEqual(expect.arrayContaining(['createDeck', 'createModel', 'addNotes']));
  expect(added).toHaveLength(1);
  expect(Object.keys(added[0])).toEqual(expect.arrayContaining(['Word', 'Meaning', 'Sentence', 'ReaderId']));

  // Syncing again changes nothing.
  await section.getByRole('button', { name: 'Sync to Anki' }).click();
  await expect(section.locator('.settings-section__note[role=status]')).toContainText('Added 0, updated 0, unchanged 1');
});

test('Export Anki package downloads an .apkg file', async ({ page }) => {
  await saveAWord(page);
  const section = await openAnkiSettings(page);
  const download = page.waitForEvent('download');
  await section.getByRole('button', { name: 'Export Anki package (.apkg)' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('Arabic Vocabulary.apkg');
  await expect(section.locator('.settings-section__note[role=status]')).toContainText('Exported 1 card');
});
