import { libraryService } from '../library/libraryService';
import { readString, STORAGE_KEYS, writeString } from '../utils/storage';
import { sidebarStartsCollapsed, type DeviceProfile } from './deviceProfile';

/** Books every install gets once. `flag` remembers it was added, so removing
 * a book never brings it back; the first keeps its original key. */
const STARTER_BOOKS = [
  { file: 'narada-kamel-kilani.epub', flag: STORAGE_KEYS.starterBookAdded },
  { file: 'qisas-al-nabiyyin.epub', flag: `${STORAGE_KEYS.starterBookAdded}:qisas-al-nabiyyin` },
  // al-Akhbar al-Tiwal by al-Dinawari, from Shamela.
  { file: 'al-akhbar-al-tiwal.epub', flag: `${STORAGE_KEYS.starterBookAdded}:al-akhbar-al-tiwal` },
];

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

let preloading: Promise<void> | null = null;

/**
 * Puts the starter books on the shelf, once each per install: on a first run
 * and on any launch that has not added one yet (an install from before it
 * existed). Removing a book does not bring it back. A failure (offline) is
 * silent and retried next launch; it never blocks the library.
 */
export function preloadStarterBooks(): Promise<void> {
  if (STARTER_BOOKS.every((b) => readString(b.flag) === '1')) return Promise.resolve();
  preloading ??= addStarterBooks().finally(() => {
    preloading = null;
  });
  return preloading;
}

async function addStarterBooks(): Promise<void> {
  for (const book of STARTER_BOOKS) {
    if (readString(book.flag) === '1') continue;
    try {
      // BASE_URL, not '/': see the note in Library.loadSample.
      const res = await fetch(`${import.meta.env.BASE_URL}${book.file}`);
      if (!res.ok) continue;
      const blob = await res.blob();
      // A fixed id, so two devices that sync see the starter book as one book, not two.
      await libraryService.importEpub(new File([blob], book.file, { type: 'application/epub+zip' }), {
        id: `starter-${book.file.replace(/\.epub$/, '')}`,
      });
      writeString(book.flag, '1');
    } catch {
      // best-effort only
    }
  }
}
