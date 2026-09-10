import { usePreferences } from '../../state/PreferencesContext';
import type { ReaderTheme } from '../../types';
import './QuickSettingsPopover.css';

const THEME_SWATCHES: { id: ReaderTheme; label: string; bg: string; fg: string }[] = [
  { id: 'light', label: 'Light', bg: '#faf7f2', fg: '#1c1b19' },
  { id: 'sepia', label: 'Sepia', bg: '#f1e6d0', fg: '#4a3a22' },
  { id: 'dark', label: 'Night', bg: '#16151a', fg: '#efe9df' },
];

const FONT_SIZE_MIN = 80;
const FONT_SIZE_MAX = 160;
const FONT_SIZE_STEP = 10;

/**
 * The "Aa" popover from the reader topbar — deliberately tiny (four things:
 * size, theme, layout), modeled on Apple Books' own reading-time quick
 * panel rather than the full Settings screen. That's the whole point of
 * having both: this is what you reach for constantly while reading, the
 * full SettingsPanel is for everything else (dictionaries, backup, Anki),
 * opened far less often and not from inside the reading view.
 */
export function QuickSettingsPopover({ onClose }: { onClose: () => void }) {
  const { prefs, updatePrefs } = usePreferences();

  function stepFontSize(delta: number) {
    const next = Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, prefs.fontSizePct + delta));
    updatePrefs({ fontSizePct: next });
  }

  return (
    <div className="quick-settings-backdrop" onClick={onClose}>
      <div className="quick-settings" onClick={(e) => e.stopPropagation()}>
        <div className="quick-settings__row">
          <button
            className="quick-settings__aa quick-settings__aa--small"
            onClick={() => stepFontSize(-FONT_SIZE_STEP)}
            disabled={prefs.fontSizePct <= FONT_SIZE_MIN}
            aria-label="Decrease font size"
          >
            A
          </button>
          <div className="quick-settings__size-value">{prefs.fontSizePct}%</div>
          <button
            className="quick-settings__aa quick-settings__aa--large"
            onClick={() => stepFontSize(FONT_SIZE_STEP)}
            disabled={prefs.fontSizePct >= FONT_SIZE_MAX}
            aria-label="Increase font size"
          >
            A
          </button>
        </div>

        <div className="quick-settings__divider" />

        <div className="quick-settings__row quick-settings__row--swatches">
          {THEME_SWATCHES.map((t) => (
            <button
              key={t.id}
              className={'quick-settings__swatch' + (prefs.theme === t.id ? ' quick-settings__swatch--active' : '')}
              style={{ background: t.bg, color: t.fg }}
              onClick={() => updatePrefs({ theme: t.id })}
              aria-label={t.label}
              title={t.label}
            >
              A
            </button>
          ))}
        </div>

        <div className="quick-settings__divider" />

        <div className="quick-settings__row">
          <button
            className={'quick-settings__flow' + (prefs.readingFlow === 'paginated' ? ' quick-settings__flow--active' : '')}
            onClick={() => updatePrefs({ readingFlow: 'paginated' })}
          >
            Paged
          </button>
          <button
            className={'quick-settings__flow' + (prefs.readingFlow === 'scrolled' ? ' quick-settings__flow--active' : '')}
            onClick={() => updatePrefs({ readingFlow: 'scrolled' })}
          >
            Scrolling
          </button>
        </div>

        <div className="quick-settings__row">
          <button
            className={'quick-settings__flow' + (!prefs.twoColumnEnabled ? ' quick-settings__flow--active' : '')}
            disabled={prefs.readingFlow === 'scrolled'}
            onClick={() => updatePrefs({ twoColumnEnabled: false })}
          >
            1 column
          </button>
          <button
            className={'quick-settings__flow' + (prefs.twoColumnEnabled ? ' quick-settings__flow--active' : '')}
            disabled={prefs.readingFlow === 'scrolled'}
            onClick={() => updatePrefs({ twoColumnEnabled: true })}
          >
            2 columns
          </button>
        </div>
      </div>
    </div>
  );
}
