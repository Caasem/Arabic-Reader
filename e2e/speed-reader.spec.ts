import { test, expect } from '@playwright/test';

// Speed Reader is intentionally hidden behind SPEED_READER_ENABLED = false in
// NavBar.tsx (its own nav tab doesn't render, so nothing below this point
// can pass) -- the code is still there, just not user-facing. Skipped
// rather than deleted so the coverage is ready the moment that flag flips
// back on; flip SPEED_READER_ENABLED to true locally to run this for real.
test.skip(true, 'Speed Reader is disabled via SPEED_READER_ENABLED in NavBar.tsx');

function parseWordIndex(label: string) {
  const m = label.replace(/,/g, '').match(/(\d+)\s*\/\s*(\d+)/);
  if (!m) return null;
  return { current: Number(m[1]), total: Number(m[2]) };
}

test('play/pause, WPM, word stepping, ORP/context toggles, seek, resume, and session summary', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('.navbar__settings', { timeout: 10000 });

  await page.locator('.navbar__item', { hasText: 'Library' }).click();
  await page.waitForSelector('text=Try the sample book', { timeout: 10000 });
  await page.click('text=Try the sample book');
  await page.waitForSelector('.book-card', { timeout: 15000 });

  await page.locator('.navbar__item', { hasText: 'Speed Reader' }).click();
  await page.waitForSelector('.speed-reader-book', { timeout: 8000 });
  await page.click('.speed-reader-book');
  await page.waitForSelector('.speed-reader-picker__start', { timeout: 10000 });

  await page.click('.speed-reader-picker__start');
  await page.waitForSelector('.rsvp-word', { timeout: 8000 });
  await page.waitForTimeout(300);

  const labelBefore = await page.locator('.rsvp-progress__label').textContent();
  await page.keyboard.press('Space');
  await page.waitForTimeout(1200);
  await page.keyboard.press('Space');
  await page.waitForTimeout(200);
  const labelAfterPlay = await page.locator('.rsvp-progress__label').textContent();
  const before = parseWordIndex(labelBefore!)!;
  const afterPlay = parseWordIndex(labelAfterPlay!)!;
  expect(afterPlay.current).toBeGreaterThan(before.current);

  const wpmBefore = Number((await page.locator('.rsvp-wpm__value').textContent())!.match(/\d+/)![0]);
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(150);
  const wpmAfter = Number((await page.locator('.rsvp-wpm__value').textContent())!.match(/\d+/)![0]);
  expect(wpmAfter).toBe(wpmBefore + 50);

  const beforeNext = parseWordIndex((await page.locator('.rsvp-progress__label').textContent())!)!;
  await page.click('[aria-label="Next word"]');
  const afterNext = parseWordIndex((await page.locator('.rsvp-progress__label').textContent())!)!;
  expect(afterNext.current).toBe(beforeNext.current + 1);
  await page.click('[aria-label="Previous word"]');
  const afterPrev = parseWordIndex((await page.locator('.rsvp-progress__label').textContent())!)!;
  expect(afterPrev.current).toBe(beforeNext.current);

  await page.click('[aria-label="Display settings"]');
  await page.waitForSelector('.rsvp-panel--settings', { timeout: 3000 });
  const orpOnClass = (await page.locator('.rsvp-word').getAttribute('class'))!;
  await page.locator('.rsvp-panel__row', { hasText: 'ORP' }).locator('.rsvp-switch').click();
  await page.waitForTimeout(150);
  const orpOffClass = (await page.locator('.rsvp-word').getAttribute('class'))!;
  if (orpOnClass.includes('rsvp-word--orp') || !orpOnClass.includes('rsvp-word--plain')) {
    expect(orpOffClass).toContain('rsvp-word--plain');
  }

  const contextBefore = await page.locator('.rsvp-focus__context').count();
  await page.locator('.rsvp-panel__row', { hasText: 'Show context' }).locator('.rsvp-switch').click();
  await page.waitForTimeout(150);
  const contextAfter = await page.locator('.rsvp-focus__context').count();
  expect(contextBefore).toBe(0);
  expect(contextAfter).toBe(1);
  await page.click('.rsvp-panel__close');

  await page.click('.rsvp-focus__word-zone');
  await page.waitForSelector('.dict-popup', { timeout: 8000 });
  await page.waitForTimeout(400);
  const popupText = await page.locator('.dict-popup').textContent();
  expect(popupText).toContain('encounter');
  expect(popupText).toContain('lookup');
  await expect(page.locator('.dict-popup__save')).toHaveCount(1);
  await page.click('.dict-popup__close');

  const track = page.locator('.rsvp-progress__track');
  const box = (await track.boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height / 2);
  await page.waitForTimeout(200);
  const afterSeek = parseWordIndex((await page.locator('.rsvp-progress__label').textContent())!)!;
  const seekRatio = afterSeek.current / afterSeek.total;
  expect(seekRatio).toBeGreaterThan(0.3);
  expect(seekRatio).toBeLessThan(0.7);

  await page.keyboard.press('Escape');
  await page.waitForSelector('.speed-reader-picker__start', { timeout: 5000 });
  await page.waitForSelector('.speed-reader-resume', { timeout: 5000 });
  const resumeText = (await page.locator('.speed-reader-resume__detail').textContent())!;
  const resumeParsed = parseWordIndex(resumeText.replace('word', '').replace('of', '/'));
  expect(resumeParsed).toBeTruthy();
  expect(Math.abs(resumeParsed!.current - afterSeek.current)).toBeLessThanOrEqual(2);

  await page.click('.speed-reader-resume');
  await page.waitForSelector('.rsvp-word', { timeout: 8000 });
  await page.waitForTimeout(300);
  const resumedLabel = parseWordIndex((await page.locator('.rsvp-progress__label').textContent())!)!;
  expect(Math.abs(resumedLabel.current - afterSeek.current)).toBeLessThanOrEqual(2);

  const box2 = (await page.locator('.rsvp-progress__track').boundingBox())!;
  await page.mouse.click(box2.x + 3, box2.y + box2.height / 2); // near the end (RTL track)
  await page.waitForTimeout(150);
  await page.click('[aria-label="Display settings"]');
  await page.waitForSelector('.rsvp-panel--settings', { timeout: 3000 });
  await page.locator('.rsvp-panel__preset', { hasText: '600' }).click();
  await page.click('.rsvp-panel__close');
  await page.keyboard.press('Space');
  await page.waitForSelector('.rsvp-summary', { timeout: 15000 });
  const summaryText = (await page.locator('.rsvp-summary__card').textContent())!;
  expect(summaryText).toContain('Session Complete');
  expect(summaryText).toContain('WPM');
  await page.click('.rsvp-summary__actions .btn--primary');
  await page.waitForSelector('.speed-reader-picker__start', { timeout: 5000 });
});
