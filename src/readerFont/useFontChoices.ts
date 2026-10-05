import { useEffect, useState, useSyncExternalStore } from 'react';
import { usePreferences } from '../state/PreferencesContext';
import { DEFAULT_PREFS } from '../state/defaultPreferences';
import { detectDeviceFonts } from './deviceFonts';
import { BUILT_IN_FAMILY, isUploadedStack, primaryFamily, stackFor } from './fontStack';
import { addUserFont, loadUserFonts, removeUserFont, subscribeUserFonts, userFontsState, type UploadedFont } from './userFonts';

export interface FontChoice {
  /** The `fontFamily` preference this choice sets; also its identity. */
  stack: string;
  label: string;
  detail: string;
  uploaded?: UploadedFont;
}

export interface FontMessage {
  text: string;
  error: boolean;
}

/**
 * The fonts a reader can pick (built in, uploaded, installed on the device),
 * plus uploading and removing. Shared by Settings -> Font and the reader's
 * own Display sheet, so both always list the same fonts.
 */
export function useFontChoices() {
  const { prefs, updatePrefs } = usePreferences();
  const userFonts = useSyncExternalStore(subscribeUserFonts, userFontsState);
  const [deviceFonts] = useState(detectDeviceFonts);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<FontMessage | null>(null);

  useEffect(() => {
    void loadUserFonts();
  }, []);

  const choices: FontChoice[] = [
    { stack: DEFAULT_PREFS.fontFamily, label: 'Lala', detail: 'Built in' },
    { stack: stackFor(BUILT_IN_FAMILY), label: BUILT_IN_FAMILY, detail: 'Built in' },
    ...userFonts.fonts.map((font) => ({
      stack: stackFor(font.cssFamily),
      label: font.family,
      detail: `Uploaded · ${font.styles.join(', ')}`,
      uploaded: font,
    })),
    ...deviceFonts.map((name) => ({ stack: stackFor(name), label: name, detail: 'On this device' })),
  ];
  // A choice from a backup or another device that isn't here: say so rather than show nothing picked.
  const waitingForUploads = isUploadedStack(prefs.fontFamily) && !userFonts.loaded;
  if (!waitingForUploads && !choices.some((choice) => choice.stack === prefs.fontFamily)) {
    choices.push({
      stack: prefs.fontFamily,
      label: primaryFamily(prefs.fontFamily).replace(/ \(uploaded\)$/, ''),
      detail: `Not on this device, so ${BUILT_IN_FAMILY} is used`,
    });
  }

  async function upload(files: FileList | File[] | null) {
    if (!files?.length) return;
    setBusy(true);
    setMessage(null);
    let added: UploadedFont | null = null;
    const errors: string[] = [];
    for (const file of Array.from(files)) {
      try {
        added = await addUserFont(file);
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e));
      }
    }
    if (added) updatePrefs({ fontFamily: stackFor(added.cssFamily) });
    if (errors.length) setMessage({ text: errors.join(' '), error: true });
    else if (added) setMessage({ text: `Added ${added.family}. Books now use it.`, error: false });
    setBusy(false);
  }

  async function remove(font: UploadedFont) {
    await removeUserFont(font.family);
    if (prefs.fontFamily === stackFor(font.cssFamily)) updatePrefs({ fontFamily: DEFAULT_PREFS.fontFamily });
    setMessage({ text: `Removed ${font.family} from this device.`, error: false });
  }

  return {
    choices,
    selected: prefs.fontFamily,
    pick: (stack: string) => updatePrefs({ fontFamily: stack }),
    upload,
    remove,
    busy,
    message,
  };
}
