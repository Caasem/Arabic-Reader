import { usePreferences } from '../state/PreferencesContext';
import { Note, SettingsSection, ToggleRow } from '../components/shared/settings/controls';
import { contrastRatio } from './color';
import { LOOK_PALETTES, LOOK_ROLES, paletteById, resolveLookColors, type LookColorRole } from './palettes';
import './lookSettings.css';

export function LookSettings() {
  const { prefs, updatePrefs } = usePreferences();
  const { lookEnabled, lookPalette, lookCustom } = prefs;
  const colors = resolveLookColors(lookPalette, lookCustom);
  const hasCustom = Object.keys(lookCustom).length > 0;
  const textContrast = contrastRatio(colors.ink, colors.bg);
  const accentContrast = contrastRatio(colors.accent, colors.surface);

  function pickPalette(id: string) {
    updatePrefs({ lookPalette: id, lookCustom: {} });
  }

  function pickColor(role: LookColorRole, value: string) {
    updatePrefs({ lookCustom: { ...lookCustom, [role]: value } });
  }

  function resetColor(role: LookColorRole) {
    const next = { ...lookCustom };
    delete next[role];
    updatePrefs({ lookCustom: next });
  }

  return (
    <SettingsSection title="Look">
      <ToggleRow
        label="New look"
        checked={lookEnabled}
        onChange={(value) => updatePrefs({ lookEnabled: value })}
      >
        Softer cards, serif headings and a fuller colour scheme. Turn it off to return to the original design.
      </ToggleRow>

      {lookEnabled && (
        <>
          <div className="look-settings__label">Palette</div>
          <div className="look-settings__palettes" role="group" aria-label="Palette">
            {LOOK_PALETTES.map((palette) => {
              const active = lookPalette === palette.id && !hasCustom;
              return (
                <button
                  key={palette.id}
                  type="button"
                  className={'look-palette' + (active ? ' look-palette--active' : '')}
                  aria-pressed={active}
                  title={palette.blurb}
                  onClick={() => pickPalette(palette.id)}
                >
                  <span className="look-palette__swatches" aria-hidden="true">
                    {[palette.colors.accent, palette.colors.secondary, palette.colors.highlight, palette.colors.warning].map((c) => (
                      <span key={c} style={{ background: c }} />
                    ))}
                  </span>
                  <span className="look-palette__name">{palette.name}</span>
                </button>
              );
            })}
          </div>
          <Note>{paletteById(lookPalette).blurb}{hasCustom ? ' You have changed some colours below.' : ''}</Note>

          <div className="look-settings__label">Colours</div>
          <ul className="look-settings__colors">
            {LOOK_ROLES.map(({ role, label, hint }) => {
              const changed = role in lookCustom;
              return (
                <li key={role} className="look-color">
                  <label className="look-color__main">
                    <input
                      type="color"
                      className="look-color__input"
                      value={colors[role]}
                      aria-label={label}
                      onChange={(e) => pickColor(role, e.target.value)}
                    />
                    <span className="look-color__text">
                      <span className="look-color__name">{label}</span>
                      <span className="look-color__hint">{hint}</span>
                    </span>
                  </label>
                  <code className="look-color__hex">{colors[role]}</code>
                  <button type="button" className="look-color__reset" disabled={!changed} onClick={() => resetColor(role)}>
                    Reset
                  </button>
                </li>
              );
            })}
          </ul>

          {hasCustom && (
            <button type="button" className="look-settings__reset-all" onClick={() => pickPalette(lookPalette)}>
              Reset all colours to {paletteById(lookPalette).name}
            </button>
          )}
          {textContrast < 4.5 && <p className="look-settings__warn">Text on the page background is hard to read at this contrast. Try a darker text colour or a lighter background.</p>}
          {accentContrast < 3 && <p className="look-settings__warn">The accent is faint against cards. Try a deeper accent.</p>}
          <Note>Background, cards and text apply to the light theme. Dark and sepia keep their own surfaces and use your accents, lightened where needed.</Note>
        </>
      )}
    </SettingsSection>
  );
}
