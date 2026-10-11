import type { Page } from '@playwright/test';

/**
 * Specs written for the epub reader start with Settings -> "New reader" off,
 * since the new reader (src/quietReader) is the default. Seeds the
 * preferences mirror only when it's empty, so a spec's own changes still
 * survive its reloads. `prefsMigrations: 1` marks them as already through
 * migration 1, which would otherwise move them to the new reader.
 */
export async function useOriginalReader(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const key = 'arabic-reader:preferences';
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ quietReaderEnabled: false, prefsMigrations: 1 }));
  });
}
