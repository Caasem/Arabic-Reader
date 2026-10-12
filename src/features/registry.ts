import type { ComponentType } from 'react';
import type { BookMeta, ReaderPreferences } from '../types';
import { dictionarySearchFeature } from '../dictionarySearch';
import { bookSearchFeature } from '../bookSearch';
import { bookVocabFeature } from '../bookVocab';
import { noteCardFeature } from '../noteCard';
import { flashCardFeature } from '../flashCard';
import { picksExportFeature } from '../picksExport';
import { studyDeskFeature } from '../studyDesk';
import { annotateFeature } from '../annotate';
import { verbFormsFeature } from '../verbForms';
import { popupCleanFeature } from '../popupClean';
import { wasitMatchFeature } from '../wasitMatch';
import { wasitStructureFeature } from '../wasitStructure';
import { lookFeature } from '../look';
import { readerFontFeature } from '../readerFont';
import { crowdSyncFeature } from '../crowdSync';
import { gettingStartedFeature } from '../gettingStarted';

/** What a reader Host gets: the open book, and a way to open another one at a place (capture trips, links). */
export interface HostProps {
  book: BookMeta;
  onOpenBook?(book: BookMeta, location?: string): void;
}

/** What an App host gets: a way to open a book at a place (the thinking desk's screens go to their sources). */
export interface AppHostProps {
  onOpenBook?(book: BookMeta, location?: string): void;
}

/** What a feature's panel above the Library's shelves gets. */
export interface LibraryTopProps {
  onOpenBook(book: BookMeta, location?: string): void;
}

/** The Settings groups (SettingsPanel's sidebar), in order. */
export type SettingsGroupId = 'appearance' | 'reading' | 'dictionary' | 'vocabulary' | 'library' | 'advanced';

/**
 * One feature, as the rest of the app sees it. A feature lives in its own folder `src/<id>/`, and its index.ts exports
 * one of these; the app wires it from here and nowhere else. docs/changes/feature-registry-howto.md says how to
 * convert a feature.
 */
export interface FeatureDescriptor {
  /** The folder name under src/. */
  id: string;
  /** The `<feature>Enabled` preference that switches it on, when it has one. The feature checks it itself. */
  pref?: keyof ReaderPreferences;
  /** Its Settings section, placed in `settingsGroup`. */
  SettingsSection?: ComponentType;
  settingsGroup?: SettingsGroupId;
  /** The key of the section it follows in its group (a core section's key or a feature id); unset: the group's end. */
  settingsAfter?: string;
  /** Mounted beside the reader (the new reader and PDF pages), for palettes, cards and overlays. */
  Host?: ComponentType<HostProps>;
  /** Mounted once in App, for app-wide effects and screens over the app. */
  AppHost?: ComponentType<AppHostProps>;
  /** Shown at the top of the Library, above its shelves (the thinking desk's Today). */
  LibraryTop?: ComponentType<LibraryTopProps>;
  /** The reader chords it registers (src/readerChords), e.g. "Alt+N". Two features may not claim the same one. */
  chords?: string[];
  /** Every place outside its folder that knows about it, besides this registry: how to remove it. */
  touchPoints: string[];
}

/**
 * Every feature, in order. The order is the order Hosts mount in (later ones draw over earlier ones), App hosts mount
 * in, and sections appear in within a Settings group. Adding a feature: its folder, plus one line here.
 */
export const FEATURES: FeatureDescriptor[] = [
  dictionarySearchFeature,
  bookSearchFeature,
  bookVocabFeature,
  noteCardFeature,
  flashCardFeature,
  picksExportFeature,
  studyDeskFeature,
  annotateFeature,
  verbFormsFeature,
  popupCleanFeature,
  wasitMatchFeature,
  wasitStructureFeature,
  lookFeature,
  readerFontFeature,
  crowdSyncFeature,
  gettingStartedFeature,
];
