/**
 * The Getting started checklist: a card at the top of the Library whose items tick themselves (docs/features/tour.md,
 * docs/changes/tour-changes.md). Parts of the app say "the person did this" with `tourEvents.emit('<item id>')`
 * (events.ts); the store (store.ts) listens from app start and keeps its state on this device only. The app wires it
 * through `gettingStartedFeature` in src/features/registry.ts; the other touch points are listed in it. To remove the
 * feature, delete this folder, its registry line and those touch points.
 */
import type { FeatureDescriptor } from '../features/registry';
import { GettingStartedSettings } from './GettingStartedSettings';
import { TourHint } from './TourHint';

export { GettingStartedCard } from './GettingStartedCard';
export { tourEvents } from './events';

export const gettingStartedFeature: FeatureDescriptor = {
  id: 'gettingStarted',
  AppHost: TourHint,
  SettingsSection: GettingStartedSettings,
  settingsGroup: 'library',
  touchPoints: [
    'the Library, which mounts the card (src/components/library/Library.tsx)',
    "tourEvents.emit calls: vocabularyService (save-word, make-flashcard), quietReader useMarks and noteCard (write-note), dictionarySearch Host (dictionary-search), studyDesk DeskHost (open-hashiya), annotate inkStore and studyDesk marginInk (draw-sketch, draw-other-source)",
    'the storage key `gettingStarted` (src/utils/storage.ts)',
    'START_HERE_BOOK_ID (src/onboarding/firstRun.ts), which "Show me" opens',
  ],
};
