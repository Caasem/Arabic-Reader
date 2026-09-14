import { usePreferences, type ResolvedTheme } from '../../state/PreferencesContext';
import { PAGE_COLORS } from '../../theme/tokens';
import './QuickSettingsPopover.css';

const THEME_SWATCHES: { id: ResolvedTheme; label: string }[] = [
  { id: 'light', label: 'Light' },
  { id: 'sepia', label: 'Sepia' },
  { id: 'dark', label: 'Night' },
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
              style={{ background: PAGE_COLORS[t.id].bg, color: PAGE_COLORS[t.id].ink }}
              aria-pressed={prefs.theme === t.id}
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
            // Reuses this one button for both reading-flow states instead of
            // adding a third "Scroll all" button: tapping it while already
            // scrolled toggles between the two continuous-scroll behaviors
            // (see `continuousScrollEnabled`'s doc comment), and its own
            // label reflects whichever is currently in effect. Tapping it
            // from Paged just switches to Scrolling, same as before.
            onClick={() =>
              updatePrefs(
                prefs.readingFlow === 'scrolled'
                  ? { continuousScrollEnabled: !prefs.continuousScrollEnabled }
                  : { readingFlow: 'scrolled' }
              )
            }
            title={
              prefs.readingFlow === 'scrolled'
                ? prefs.continuousScrollEnabled
                  ? 'Scrolls through the whole book — tap for chapter-by-chapter scrolling'
                  : 'Scrolls one chapter at a time — tap to scroll through the whole book'
                : undefined
            }
          >
            {prefs.readingFlow === 'scrolled' && prefs.continuousScrollEnabled ? 'Scroll all' : 'Scrolling'}
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

        <div className="quick-settings__divider" />

        {/* Reading width -- deliberately no icon, label, or percentage (see
            the feature's own design brief): an iOS Control Center-style
            slider is meant to be read by feel/position, not by a number.
            min/max match the Settings panel's own reading-width slider
            (same underlying pref, readingWidthPct); step is finer here
            (1 vs Settings' 5) since dragging is this control's whole
            reason to exist. */}
        <div className="quick-settings__row">
          <input
            type="range"
            className="quick-settings__width-slider"
            min={50}
            max={100}
            step={1}
            value={prefs.readingWidthPct}
            onChange={(e) => updatePrefs({ readingWidthPct: Number(e.target.value) })}
            aria-label="Reading width"
          />
        </div>
      </div>
    </div>
  );
}
