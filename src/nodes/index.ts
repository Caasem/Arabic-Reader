/**
 * Nodes (docs/features/nodes.md). Self-contained: the app wires it through `nodesFeature` in
 * src/features/registry.ts, whose touch points list the rest. Every change is listed in
 * docs/changes/nodes-changes.md. To remove the feature, delete this folder, its registry line and those touch
 * points.
 */
import type { FeatureDescriptor } from '../features/registry';
import { NodesHost } from './NodesHost';
import { NodesSettings } from './NodesSettings';

export const nodesFeature: FeatureDescriptor = {
  id: 'nodes',
  pref: 'nodesEnabled',
  Host: NodesHost,
  SettingsSection: NodesSettings,
  settingsGroup: 'dictionary',
  settingsAfter: 'annotate',
  chords: ['Alt+O'],
  touchPoints: [
    'the `nodesEnabled` and `nodesDefaultStyle` preferences (src/types/preferences.ts, src/state/defaultPreferences.ts)',
    'its database (NODES_DB) in the storage registry (src/storage/registry.ts) and the full export (src/dataExport/stores.ts)',
  ],
};
