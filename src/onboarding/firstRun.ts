import { libraryService } from '../library/libraryService';
import { readString, STORAGE_KEYS, writeString } from '../utils/storage';
import { sidebarStartsCollapsed, type DeviceProfile } from './deviceProfile';

const STARTER_BOOK_FILE = 'narada-kamel-kilani.epub';

/**
 * Onboarding runs once, on a device that has never opened the app: no
 * remembered preferences and no completed flag. An existing install (it has a
 * preferences mirror) never sees it, and its settings are never overwritten.
 * Read before the PreferencesProvider mounts, since that writes the mirror.
 */
export function shouldShowOnboarding(): boolean {
  return readString(STORAGE_KEYS.onboardingDone) !== '1' && readString(STORAGE_KEYS.preferencesMirror) === null;
}

export function markOnboardingDone(): void {
  writeString(STORAGE_KEYS.onboardingDone, '1');
}

export function applySidebarStart(profile: DeviceProfile): void {
  writeString(STORAGE_KEYS.navbarCollapsed, sidebarStartsCollapsed(profile) ? '1' : '0');
}

/**
 * Puts the starter book on the shelf, once. A failure (offline on the very
 * first launch) is silent and retried on the next first run; it never blocks
 * the library.
 */
export async function preloadStarterBook(): Promise<void> {
  if (readString(STORAGE_KEYS.starterBookAdded) === '1') return;
  try {
    // BASE_URL, not '/': see the note in Library.loadSample.
    const res = await fetch(`${import.meta.env.BASE_URL}${STARTER_BOOK_FILE}`);
    if (!res.ok) return;
    const blob = await res.blob();
    await libraryService.importEpub(new File([blob], STARTER_BOOK_FILE, { type: 'application/epub+zip' }));
    writeString(STORAGE_KEYS.starterBookAdded, '1');
  } catch {
    // best-effort only
  }
}
