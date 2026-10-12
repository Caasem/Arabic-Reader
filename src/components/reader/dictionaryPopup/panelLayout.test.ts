import { describe, expect, it } from 'vitest';
import type { DictionaryPanelLayout } from '../../../types';
import { DEFAULT_PREFS, withDefaults } from '../../../state/defaultPreferences';
import { effectivePanelLayout } from './panelLayout';

describe('effectivePanelLayout', () => {
  it('accepts tabs as a layout when several dictionaries have an entry', () => {
    const tabs: DictionaryPanelLayout = 'tabs';
    expect(effectivePanelLayout(tabs, true)).toBe('tabs');
  });
  it('falls back to merged for tabs and split with a single dictionary', () => {
    expect(effectivePanelLayout('tabs', false)).toBe('merged');
    expect(effectivePanelLayout('split', false)).toBe('merged');
  });
  it('keeps single and merged as they were', () => {
    expect(effectivePanelLayout('single', false)).toBe('single');
    expect(effectivePanelLayout('merged', true)).toBe('merged');
    expect(effectivePanelLayout('split', true)).toBe('split');
  });
  it('leaves the default layout alone', () => {
    expect(DEFAULT_PREFS.dictionaryPanelLayout).toBe('merged');
    expect(withDefaults({ dictionaryPanelLayout: 'tabs' }).dictionaryPanelLayout).toBe('tabs');
  });
});
