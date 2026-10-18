import { Note, SegmentedRow, SettingsSection, ToggleRow } from '../components/shared/settings/controls';
import { usePreferences } from '../state/PreferencesContext';

export function NodesSettings() {
  const { prefs, updatePrefs } = usePreferences();
  return (
    <SettingsSection title="Nodes (Alt+O)">
      <Note>
        Drop a node anywhere on a page or in its margins (Alt+O, or Node in the dock, then tap the page). Drag it wherever you like: on PDF pages it stays where you put it at
        every zoom; in the reader it is tied to the nearest word and moves with the text. Tap a node to open what is attached to it, and again to collapse it.
      </Note>
      <ToggleRow label="Enable nodes" checked={prefs.nodesEnabled} onChange={(value) => updatePrefs({ nodesEnabled: value })} />
      <SegmentedRow
        label="New nodes open as"
        options={[
          { id: 'reticle', label: 'Reticle' },
          { id: 'branch', label: 'Branch' },
        ]}
        value={prefs.nodesDefaultStyle}
        onChange={(value) => updatePrefs({ nodesDefaultStyle: value })}
      />
      <Note>A reticle opens as a side panel with an outline. A branch opens as a tree across the page. You can switch any node later.</Note>
    </SettingsSection>
  );
}
