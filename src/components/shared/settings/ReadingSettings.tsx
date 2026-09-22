import { usePreferences } from '../../../state/PreferencesContext';
import type { PageDirection, ReaderTheme, ReadingFlow } from '../../../types';
import { type Option, RangeRow, SegmentedRow, SettingsSection, ToggleRow } from './controls';

const THEMES: Option<ReaderTheme>[] = [
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Night' },
  { id: 'sepia', label: 'Sepia' },
  { id: 'system', label: 'System' },
];

const READING_FLOWS: Option<ReadingFlow>[] = [
  { id: 'paginated', label: 'Paged' },
  { id: 'scrolled', label: 'Scrolling' },
];

const PAGE_DIRECTIONS: Option<PageDirection>[] = [
  { id: 'auto', label: 'Automatic' },
  { id: 'rtl', label: 'RTL' },
  { id: 'ltr', label: 'LTR' },
];

export function ReadingSettings() {
  const { prefs, updatePrefs } = usePreferences();
  const scrolled = prefs.readingFlow === 'scrolled';

  return (
    <SettingsSection title="Reading">
      <SegmentedRow label="Theme" options={THEMES} value={prefs.theme} onChange={(theme) => updatePrefs({ theme })} />
      <SegmentedRow
        label="Layout"
        options={READING_FLOWS}
        value={prefs.readingFlow}
        onChange={(readingFlow) => updatePrefs({ readingFlow })}
      />

      <ToggleRow
        label="Two-column layout"
        checked={prefs.twoColumnEnabled}
        disabled={scrolled}
        onChange={(twoColumnEnabled) => updatePrefs({ twoColumnEnabled })}
      >
        Shows two pages side by side, like an open book — only has an effect in Paged layout.
        {scrolled && ' Switch to Paged above to use it.'}
      </ToggleRow>

      <ToggleRow
        label="Scroll through whole book"
        checked={prefs.continuousScrollEnabled}
        disabled={!scrolled}
        onChange={(continuousScrollEnabled) => updatePrefs({ continuousScrollEnabled })}
      >
        Off: scrolling stops at each chapter's end. On: chapters flow into each other, so scrolling carries straight
        through into the next one — only has an effect in Scrolling layout.
        {!scrolled && ' Switch to Scrolling above to use it.'}
        {' '}Also available as the Scrolling button's second state in the reader's own Aa menu.
      </ToggleRow>

      <ToggleRow
        label="End-of-page indicator"
        checked={prefs.showPageBoundaries}
        onChange={(showPageBoundaries) => updatePrefs({ showPageBoundaries })}
      >
        Shows a subtle divider at the bottom of the reading area when you reach the end of the current page (Paged
        layout) or the end of a chapter (Scrolling layout).
      </ToggleRow>

      <RangeRow
        label="Font size"
        min={80}
        max={160}
        step={5}
        value={prefs.fontSizePct}
        format={(v) => `${v}%`}
        onChange={(fontSizePct) => updatePrefs({ fontSizePct })}
      />
      <RangeRow
        label="Line height"
        min={1.4}
        max={2.8}
        step={0.1}
        value={prefs.lineHeight}
        format={(v) => v.toFixed(1)}
        onChange={(lineHeight) => updatePrefs({ lineHeight })}
      />
      <SegmentedRow
        label="Page direction"
        options={PAGE_DIRECTIONS}
        value={prefs.pageDirection}
        onChange={(pageDirection) => updatePrefs({ pageDirection })}
      />
      <RangeRow
        label="Reading width"
        min={50}
        max={100}
        step={5}
        value={prefs.readingWidthPct}
        format={(v) => `${v}%`}
        onChange={(readingWidthPct) => updatePrefs({ readingWidthPct })}
      />
    </SettingsSection>
  );
}
