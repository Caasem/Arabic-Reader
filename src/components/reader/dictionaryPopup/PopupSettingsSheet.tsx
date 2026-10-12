import { useEffect, useRef } from 'react';
import type { KeyboardEvent } from 'react';
import { usePreferences } from '../../../state/PreferencesContext';
import { dictionaryManager } from '../../../dictionary';
import { orderProviders } from '../../../dictionary/providerOrder';
import type { DictionaryPanelLayout } from '../../../types';
import { Note, type Option, RangeRow, SegmentedRow, SettingsSection, ToggleRow } from '../../shared/settings/controls';
import { ProviderOrderList } from '../../shared/settings/ProviderOrderList';
import '../../shared/SettingsPanel.css';
import './PopupSettingsSheet.css';

const PANEL_LAYOUTS: Option<DictionaryPanelLayout>[] = [
  { id: 'merged', label: 'Merged' },
  { id: 'split', label: 'Split' },
  { id: 'single', label: 'Single' },
  { id: 'tabs', label: 'Tabs' },
];

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * The popup's own settings, as a sheet that slides up over the popup's content. It edits the same
 * preferences as Settings -> Dictionaries (and the reading-the-entries switches elsewhere in Settings),
 * built from the same rows, so a change here is a change there, and applies at once.
 */
export function PopupSettingsSheet({ onToggleProvider, onClose }: { onToggleProvider(id: string, on: boolean): void; onClose(): void }) {
  const { prefs, updatePrefs } = usePreferences();
  const panelRef = useRef<HTMLDivElement>(null);
  const providers = orderProviders(dictionaryManager.getProviders(), prefs.dictionaryProviderOrder ?? []);

  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  // Nothing typed in here reaches the reader's own shortcuts (Space saves the word, F opens the full page ...).
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key !== 'Tab' || !panelRef.current) return;
    const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === panelRef.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  return (
    <div className="dict-sheet">
      <div className="dict-sheet__scrim" onClick={onClose} />
      <div ref={panelRef} className="dict-sheet__panel" role="dialog" aria-modal="true" aria-label="Popup settings" tabIndex={-1} onKeyDown={onKeyDown}>
        <div className="dict-sheet__bar">
          <span className="dict-sheet__title">Popup settings</span>
          <button type="button" className="dict-sheet__done" onClick={onClose}>
            Done
          </button>
        </div>

        <SettingsSection title="Layout">
          <SegmentedRow
            label="Multiple dictionaries"
            options={PANEL_LAYOUTS}
            value={prefs.dictionaryPanelLayout}
            onChange={(dictionaryPanelLayout) => updatePrefs({ dictionaryPanelLayout })}
          />
          <RangeRow
            label="Text size"
            min={70}
            max={150}
            step={5}
            value={prefs.dictionaryPopupSizePct}
            format={(v) => `${v}%`}
            onChange={(dictionaryPopupSizePct) => updatePrefs({ dictionaryPopupSizePct })}
          />
          <ToggleRow
            label="Clean popup layout"
            checked={prefs.dictionaryPopupCleanLayout}
            onChange={(dictionaryPopupCleanLayout) => updatePrefs({ dictionaryPopupCleanLayout })}
          />
        </SettingsSection>

        <SettingsSection title="Dictionaries in the popup">
          <Note>Drag the grip to put them in order; the switch turns one on or off.</Note>
          <ProviderOrderList
            providers={providers}
            enabledIds={prefs.enabledProviderIds}
            onToggle={onToggleProvider}
            onReorder={(dictionaryProviderOrder) => updatePrefs({ dictionaryProviderOrder })}
          />
        </SettingsSection>

        <SettingsSection title="Reading the entries">
          <ToggleRow
            label="Colour the entry that matches the word you looked up"
            checked={prefs.wasitMatchHighlight}
            onChange={(wasitMatchHighlight) => updatePrefs({ wasitMatchHighlight })}
          />
          <ToggleRow
            label="Scroll to it when it's out of view"
            checked={prefs.subEntryScroll}
            disabled={!prefs.wasitMatchHighlight}
            onChange={(subEntryScroll) => updatePrefs({ subEntryScroll })}
          />
          <ToggleRow
            label="Order readings by the vowels written in the text, greying the ones that don't match"
            checked={prefs.vowelRanking}
            onChange={(vowelRanking) => updatePrefs({ vowelRanking })}
          />
          <ToggleRow
            label="Show labels and plurals as badges"
            checked={prefs.wasitLabelsEnabled}
            disabled={!prefs.wasitStructureEnabled}
            onChange={(wasitLabelsEnabled) => updatePrefs({ wasitLabelsEnabled })}
          />
          <ToggleRow
            label="Set quoted verses apart, one line each with the two halves side by side"
            checked={prefs.sihahVerseLayout}
            onChange={(sihahVerseLayout) => updatePrefs({ sihahVerseLayout })}
          />
        </SettingsSection>
      </div>
    </div>
  );
}
