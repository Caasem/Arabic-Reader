// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

// Importing the registry imports every feature; some start a Web Worker when loaded.
vi.hoisted(() => {
  globalThis.Worker ??= class {
    postMessage() {}
    terminate() {}
    addEventListener() {}
    removeEventListener() {}
  } as unknown as typeof Worker;
});
import { DEFAULT_PREFS } from '../state/defaultPreferences';
import { sectionOrder } from './placement';
import { FEATURES, type FeatureDescriptor } from './registry';

describe('feature registry', () => {
  it('names each feature once, after its folder', () => {
    const ids = FEATURES.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every feature section a group, and every pref is a real preference', () => {
    for (const f of FEATURES) {
      if (f.SettingsSection) expect(f.settingsGroup, f.id).toBeDefined();
      if (f.pref) expect(DEFAULT_PREFS, f.id).toHaveProperty(f.pref);
    }
  });

  it('lets no two features claim the same chord', () => {
    const seen = new Map<string, string>();
    for (const f of FEATURES)
      for (const chord of f.chords ?? []) {
        expect(seen.get(chord), `${chord}: ${seen.get(chord)} and ${f.id}`).toBeUndefined();
        seen.set(chord, f.id);
      }
  });

  // The hand-written lists the registry replaced (phase 5), so its order can't drift.
  it('mounts reader hosts in the order ReaderSwitch listed them', () => {
    expect(FEATURES.filter((f) => f.Host).map((f) => f.id)).toEqual([
      'dictionarySearch',
      'bookSearch',
      'bookVocab',
      'noteCard',
      'flashCard',
      'picksExport',
      'studyDesk',
      'annotate',
    ]);
  });

  it('mounts app hosts in the order App listed them', () => {
    expect(FEATURES.filter((f) => f.AppHost).map((f) => f.id)).toEqual(['look', 'readerFont', 'crowdSync']);
  });

  it('places settings sections where SettingsPanel listed them', () => {
    expect(sectionOrder('appearance', [], FEATURES)).toEqual(['look']);
    expect(sectionOrder('reading', ['quiet', 'reading', 'touch', 'search', 'pomodoro', 'pdfimport', 'pdfhighlighter', 'pdfocr'], FEATURES)).toEqual([
      'quiet',
      'reading',
      'readerFont',
      'touch',
      'search',
      'pomodoro',
      'pdfimport',
      'pdfhighlighter',
      'pdfocr',
    ]);
    expect(sectionOrder('dictionary', ['dictionaries'], FEATURES)).toEqual([
      'dictionaries',
      'dictionarySearch',
      'bookSearch',
      'bookVocab',
      'noteCard',
      'flashCard',
      'studyDesk',
      'annotate',
      'verbForms',
      'popupClean',
      'wasitMatch',
      'wasitStructure',
    ]);
    expect(sectionOrder('vocabulary', ['levels', 'anki'], FEATURES)).toEqual(['levels', 'anki']);
    expect(sectionOrder('library', ['librarypage', 'browselibrary', 'shamela', 'storage', 'backup', 'sync'], FEATURES)).toEqual([
      'librarypage',
      'browselibrary',
      'shamela',
      'storage',
      'backup',
      'sync',
      'crowdSync',
    ]);
  });
});

describe('sectionOrder', () => {
  const section = (id: string, settingsAfter?: string): FeatureDescriptor => ({
    id,
    SettingsSection: () => null,
    settingsGroup: 'reading',
    settingsAfter,
    touchPoints: [],
  });

  it('keeps registry order among features placed after the same section', () => {
    expect(sectionOrder('reading', ['a', 'b'], [section('x', 'a'), section('y', 'a'), section('z')])).toEqual(['a', 'x', 'y', 'b', 'z']);
  });

  it('puts a feature whose anchor is missing at the end, and ignores other groups', () => {
    const other: FeatureDescriptor = { ...section('w'), settingsGroup: 'library' };
    expect(sectionOrder('reading', ['a'], [section('x', 'gone'), other])).toEqual(['a', 'x']);
  });
});
