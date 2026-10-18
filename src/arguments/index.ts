/**
 * Argument layer (docs/features/argument-layer.md): Toulmin roles on words, margin cards and the sheet.
 *
 * Wired through `argumentsFeature` in src/features/registry.ts. Touch points outside this folder, and how to remove it
 * (delete this folder and its registry line, then undo these):
 */
import type { FeatureDescriptor } from '../features/registry';
import { ArgumentsGate } from './gates';
import { ArgumentsSettings } from './ArgumentsSettings';

export const argumentsFeature: FeatureDescriptor = {
  id: 'arguments',
  pref: 'argumentsEnabled',
  Host: ArgumentsGate,
  SettingsSection: ArgumentsSettings,
  settingsGroup: 'reading',
  chords: ['Alt+A'],
  touchPoints: [
    'the `argumentsEnabled` preference (src/types/preferences.ts, src/state/defaultPreferences.ts)',
    'DeskItem.argument, the argument fields on a study desk item (src/studyDesk/types.ts)',
    "the argument card inside the study desk's margin card: its heading and extras (src/studyDesk/MarginLayer.tsx, Gloss)",
    'paintArguments and the qr-arg-* highlight names (src/readerCore/paint.ts, src/quietReader/quietReader.css)',
    'the role colour tokens --c-reply and --s-* (src/theme/palette.css)',
    "the thinking desk's moves give way while it is on: movesOn (src/thinking/switches.ts and the places that use it)",
  ],
};

export * from './edit';
export * from './gaps';
export * from './layout';
export * from './roles';
export * from './selection';
export * from './targets';
