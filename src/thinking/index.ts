/**
 * The thinking desk (docs/features/thinking-front.md): threads, argument moves, backlinks, masāʾil, Muqābala,
 * Revisit, Today and the closing prompt, built on the study desk's desks, items and documents (src/studyDesk).
 * Self-contained: the app wires it through `thinkingFeature` in src/features/registry.ts; the other touch points are
 * listed in it. Every change is listed in docs/changes/thinking-front-changes.md. To remove the feature, delete this
 * folder, its registry line and those touch points. Everything here loads on demand (gates.tsx).
 */
import type { FeatureDescriptor } from '../features/registry';
import { ThinkingAppHost, ThinkingHost } from './gates';
import { ThinkingSettings } from './ThinkingSettings';

export const thinkingFeature: FeatureDescriptor = {
  id: 'thinking',
  pref: 'thinkingFrontEnabled',
  Host: ThinkingHost,
  AppHost: ThinkingAppHost,
  SettingsSection: ThinkingSettings,
  settingsGroup: 'reading',
  chords: ['Alt+T', 'Alt+Q'],
  touchPoints: [
    'the `thinking*` preferences (src/types/preferences.ts, src/state/defaultPreferences.ts)',
    "the study desk's data: the thinking fields on DeskItem and Desk, the links and journal tables, desk database version 2 and their store functions (src/studyDesk: types, db, deskStore), in the storage registry and the full export",
    "the study desk's desk document: an embedded mode, an optional book and a thread's members in its side panel (src/studyDesk/DeskDocument.tsx)",
    'the registry extension points it uses: App host props and LibraryTop (src/features/registry.ts, src/App.tsx, src/components/library/Library.tsx)',
  ],
};
