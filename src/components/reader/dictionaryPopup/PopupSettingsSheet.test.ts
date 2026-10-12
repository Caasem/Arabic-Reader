// @vitest-environment jsdom
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PREFS } from '../../../state/defaultPreferences';
import { PreferencesContext } from '../../../state/PreferencesContext';
import type { ReaderPreferences } from '../../../types';

vi.mock('../../../dictionary', () => ({
  dictionaryManager: {
    getProviders: () => [
      { id: 'one', name: 'First dictionary' },
      { id: 'two', name: 'Second dictionary' },
    ],
  },
}));

import { PopupSettingsSheet } from './PopupSettingsSheet';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
let prefs: ReaderPreferences;
const updatePrefs = vi.fn((patch: Partial<ReaderPreferences>) => {
  prefs = { ...prefs, ...patch };
});
const onClose = vi.fn();
const onToggleProvider = vi.fn();

function render() {
  act(() => {
    root.render(
      createElement(
        PreferencesContext.Provider,
        { value: { prefs, updatePrefs, resolvedTheme: 'light' } },
        createElement(PopupSettingsSheet, { onClose, onToggleProvider }),
      ),
    );
  });
}

beforeEach(() => {
  prefs = { ...DEFAULT_PREFS, enabledProviderIds: ['one'] };
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  updatePrefs.mockClear();
  onClose.mockClear();
  onToggleProvider.mockClear();
  render();
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe('PopupSettingsSheet', () => {
  it('is a labelled dialog with focus inside it', () => {
    const dialog = host.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog.getAttribute('aria-label')).toBe('Popup settings');
    expect(document.activeElement).toBe(dialog);
  });

  it('closes with Done, the scrim and Escape', () => {
    act(() => (Array.from(host.querySelectorAll('button')).find((b) => b.textContent === 'Done') as HTMLElement).click());
    act(() => (host.querySelector('.dict-sheet__scrim') as HTMLElement).click());
    act(() => {
      (host.querySelector('[role="dialog"]') as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('offers the four layouts and writes the chosen one to the preference', () => {
    const group = host.querySelector('[role="group"][aria-label="Multiple dictionaries"]') as HTMLElement;
    expect(Array.from(group.querySelectorAll('button')).map((b) => b.textContent)).toEqual(['Merged', 'Split', 'Single', 'Tabs']);
    act(() => (Array.from(group.querySelectorAll('button')).find((b) => b.textContent === 'Tabs') as HTMLElement).click());
    expect(updatePrefs).toHaveBeenCalledWith({ dictionaryPanelLayout: 'tabs' });
  });

  it('binds the size slider to the popup size preference with the Settings range', () => {
    const range = host.querySelector('input[type="range"]') as HTMLInputElement;
    expect([range.min, range.max, range.step, range.value]).toEqual(['70', '150', '5', String(DEFAULT_PREFS.dictionaryPopupSizePct)]);
  });

  it('lists every dictionary with a grip, and reports a switch', () => {
    const grips = Array.from(host.querySelectorAll('.reorder-grip')).map((g) => g.getAttribute('aria-label'));
    expect(grips).toEqual(['Move First dictionary (position 1 of 2)', 'Move Second dictionary (position 2 of 2)']);
    const boxes = host.querySelectorAll<HTMLInputElement>('.settings-row--dict input[type="checkbox"]');
    expect([boxes[0].checked, boxes[1].checked]).toEqual([true, false]);
    act(() => boxes[1].click());
    expect(onToggleProvider).toHaveBeenCalledWith('two', true);
  });

  it('moves a dictionary with the arrow keys on its grip', () => {
    const grip = host.querySelector('.reorder-grip') as HTMLElement;
    act(() => {
      grip.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    });
    expect(updatePrefs).toHaveBeenCalledWith({ dictionaryProviderOrder: ['two', 'one'] });
  });
});
