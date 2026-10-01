import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { usePreferences } from '../state/PreferencesContext';
import { DEFAULT_PREFS } from '../state/defaultPreferences';
import { Note, SettingsSection, ToggleRow } from '../components/shared/settings/controls';
import { detectDeviceFonts } from './deviceFonts';
import { BUILT_IN_FAMILY, isUploadedStack, primaryFamily, stackFor } from './fontStack';
import { addUserFont, loadUserFonts, removeUserFont, subscribeUserFonts, userFontsState, type UploadedFont } from './userFonts';
import './fontSettings.css';

/** "And the best companion in time is a book" (al-Mutanabbi). */
const SAMPLE = 'وَخَيْرُ جَلِيسٍ فِي الزَّمَانِ كِتَابُ';

interface Choice {
  stack: string;
  label: string;
  detail: string;
  uploaded?: UploadedFont;
}

export function FontSettings() {
  const { prefs, updatePrefs } = usePreferences();
  const userFonts = useSyncExternalStore(subscribeUserFonts, userFontsState);
  const [deviceFonts] = useState(detectDeviceFonts);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [confirmingRemove, setConfirmingRemove] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void loadUserFonts();
  }, []);

  const choices: Choice[] = [
    { stack: DEFAULT_PREFS.fontFamily, label: BUILT_IN_FAMILY, detail: 'Built in' },
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

  async function upload(files: FileList | null) {
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
    if (inputRef.current) inputRef.current.value = '';
  }

  async function remove(font: UploadedFont) {
    if (confirmingRemove !== font.family) {
      setConfirmingRemove(font.family);
      return;
    }
    setConfirmingRemove(null);
    await removeUserFont(font.family);
    if (prefs.fontFamily === stackFor(font.cssFamily)) updatePrefs({ fontFamily: DEFAULT_PREFS.fontFamily });
    setMessage({ text: `Removed ${font.family} from this device.`, error: false });
  }

  return (
    <SettingsSection title="Font">
      <div className="font-settings__choices" role="radiogroup" aria-label="Arabic font">
        {choices.map((choice) => {
          const active = choice.stack === prefs.fontFamily;
          const font = choice.uploaded;
          return (
            <div key={choice.stack} className={'font-choice' + (active ? ' font-choice--active' : '')}>
              <button
                type="button"
                role="radio"
                aria-checked={active}
                className="font-choice__pick"
                onClick={() => updatePrefs({ fontFamily: choice.stack })}
              >
                <span className="font-choice__text">
                  <span className="font-choice__name">{choice.label}</span>
                  <span className="font-choice__detail">{choice.detail}</span>
                </span>
                <span className="font-choice__sample" dir="rtl" lang="ar" style={{ fontFamily: choice.stack }}>
                  {SAMPLE}
                </span>
              </button>
              {font && (
                <button
                  type="button"
                  className={'font-choice__remove' + (confirmingRemove === font.family ? ' font-choice__remove--confirm' : '')}
                  onClick={() => void remove(font)}
                  onBlur={() => setConfirmingRemove(null)}
                  aria-label={confirmingRemove === font.family ? `Confirm removing ${font.family}` : `Remove ${font.family}`}
                >
                  {confirmingRemove === font.family ? 'Remove?' : 'Remove'}
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="font-settings__upload">
        <button type="button" className="btn btn--ghost" onClick={() => inputRef.current?.click()} disabled={busy}>
          {busy ? 'Adding…' : 'Upload a font file…'}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".ttf,.otf,.woff,.woff2,.ttc,font/*"
          multiple
          hidden
          onChange={(e) => void upload(e.target.files)}
        />
      </div>
      {message && (
        <p className={'font-settings__message' + (message.error ? ' font-settings__message--error' : '')} role={message.error ? 'alert' : 'status'}>
          {message.text}
        </p>
      )}
      <Note>
        A .ttf, .otf, .woff or .woff2 file. Uploaded fonts are kept on this device only and are not part of backups.
        Upload several weights of one font (say Light and Bold) and they become one choice.
      </Note>

      <ToggleRow
        label="Use for all Arabic text"
        checked={prefs.readingFontAppWide}
        onChange={(readingFontAppWide) => updatePrefs({ readingFontAppWide })}
      >
        On: the dictionary, vocabulary and review use this font too. Off: only book text does.
      </ToggleRow>
    </SettingsSection>
  );
}
