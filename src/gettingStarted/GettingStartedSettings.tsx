import { Note, SettingsSection, ToggleRow } from '../components/shared/settings/controls';
import { count, total } from './progress';
import { gettingStartedStore } from './store';
import { useGettingStarted } from './useGettingStarted';

export function GettingStartedSettings() {
  const state = useGettingStarted();
  return (
    <SettingsSection title="Getting started checklist">
      <Note>
        A short card at the top of the Library with things to try. Each one ticks itself when you do it ({count(state)} of {total()} so far). It hides
        itself when everything is done.
      </Note>
      <ToggleRow label="Show the checklist in the Library" checked={!state.hidden} onChange={(show) => gettingStartedStore.patch({ hidden: !show, celebrated: show ? false : state.celebrated })} />
      <button type="button" className="btn btn--ghost" onClick={() => gettingStartedStore.startOver()}>
        Start over
      </button>
    </SettingsSection>
  );
}
