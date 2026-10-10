import { Note, RangeRow, SegmentedRow, SettingsSection, ToggleRow } from '../../components/shared/settings/controls';
import { usePreferences } from '../../state/PreferencesContext';

const OUTLINES = [
  { id: 'off', label: 'Off' },
  { id: 'hover', label: 'When pointed at' },
  { id: 'always', label: 'Always' },
] as const;

/** Settings → Highlighter: how highlights drawn on PDF pages look (fill, its strength, outline). */
export function PdfHighlighterSettings() {
  const { prefs, updatePrefs } = usePreferences();
  const fill = prefs.pdfHighlightFill;
  return (
    <SettingsSection title="Highlighter">
      <Note>
        On PDF pages, drag over words (or select text) to highlight them. These settings change how every highlight looks. With the fill off, highlights are
        shown by their outline only.
      </Note>
      <ToggleRow
        label="Fill"
        checked={fill}
        onChange={(value) => updatePrefs(value || prefs.pdfHighlightOutline !== 'off' ? { pdfHighlightFill: value } : { pdfHighlightFill: false, pdfHighlightOutline: 'always' })}
      />
      {fill && (
        <RangeRow
          label="Fill strength"
          min={0.2}
          max={1}
          step={0.1}
          value={prefs.pdfHighlightOpacity}
          format={(v) => `${Math.round(v * 100)}%`}
          onChange={(value) => updatePrefs({ pdfHighlightOpacity: value })}
        />
      )}
      <SegmentedRow
        label="Outline"
        options={fill ? OUTLINES : OUTLINES.filter((o) => o.id !== 'off')}
        value={prefs.pdfHighlightOutline}
        onChange={(value) => updatePrefs({ pdfHighlightOutline: value })}
      />
    </SettingsSection>
  );
}
