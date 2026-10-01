import { useRef, useState } from 'react';
import { usePreferences } from '../state/PreferencesContext';
import { Note, SettingsSection, ToggleRow } from '../components/shared/settings/controls';
import { FONT_FILE_ACCEPT, FONT_SAMPLE } from './fontStack';
import { useFontChoices } from './useFontChoices';
import type { UploadedFont } from './userFonts';
import './fontSettings.css';

export function FontSettings() {
  const { prefs, updatePrefs } = usePreferences();
  const fonts = useFontChoices();
  const [confirmingRemove, setConfirmingRemove] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function remove(font: UploadedFont) {
    if (confirmingRemove !== font.family) {
      setConfirmingRemove(font.family);
      return;
    }
    setConfirmingRemove(null);
    await fonts.remove(font);
  }

  return (
    <SettingsSection title="Font">
      <div className="font-settings__choices" role="radiogroup" aria-label="Arabic font">
        {fonts.choices.map((choice) => {
          const active = choice.stack === fonts.selected;
          const font = choice.uploaded;
          return (
            <div key={choice.stack} className={'font-choice' + (active ? ' font-choice--active' : '')}>
              <button type="button" role="radio" aria-checked={active} className="font-choice__pick" onClick={() => fonts.pick(choice.stack)}>
                <span className="font-choice__text">
                  <span className="font-choice__name">{choice.label}</span>
                  <span className="font-choice__detail">{choice.detail}</span>
                </span>
                <span className="font-choice__sample" dir="rtl" lang="ar" style={{ fontFamily: choice.stack }}>
                  {FONT_SAMPLE}
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
        <button type="button" className="btn btn--ghost" onClick={() => inputRef.current?.click()} disabled={fonts.busy}>
          {fonts.busy ? 'Adding…' : 'Upload a font file…'}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={FONT_FILE_ACCEPT}
          multiple
          hidden
          onChange={(e) => {
            void fonts.upload(e.target.files).then(() => {
              if (inputRef.current) inputRef.current.value = '';
            });
          }}
        />
      </div>
      {fonts.message && (
        <p
          className={'font-settings__message' + (fonts.message.error ? ' font-settings__message--error' : '')}
          role={fonts.message.error ? 'alert' : 'status'}
        >
          {fonts.message.text}
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
