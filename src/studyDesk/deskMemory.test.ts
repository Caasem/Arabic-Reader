// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  currentDeskId,
  docPanelMinimised,
  lastMargins,
  pullTarget,
  rememberCurrentDeskId,
  rememberDocPanelMinimised,
  rememberLastMargins,
  rememberPullTarget,
  setSnapEnabled,
  snapEnabled,
} from './deskMemory';

describe('what the study desk remembers', () => {
  beforeEach(() => localStorage.clear());

  it('reads values saved the old way, under the same keys', () => {
    localStorage.setItem('studyDesk.docPanelMin', '1');
    localStorage.setItem('studyDesk.lastMargins', 'left');
    localStorage.setItem('studyDesk.pullTarget', 'inbox');
    localStorage.setItem('studyDesk.pdfSnap', 'off');
    localStorage.setItem('studyDesk.current.book-1', 'desk-7');
    expect(docPanelMinimised()).toBe(true);
    expect(lastMargins()).toBe('left');
    expect(pullTarget()).toBe('inbox');
    expect(snapEnabled()).toBe(false);
    expect(currentDeskId('book-1')).toBe('desk-7');
    expect(currentDeskId('book-2')).toBeNull();
  });

  it('writes under the same keys, in the same plain-string format', () => {
    rememberDocPanelMinimised(true);
    expect(localStorage.getItem('studyDesk.docPanelMin')).toBe('1');
    rememberDocPanelMinimised(false);
    expect(localStorage.getItem('studyDesk.docPanelMin')).toBe('0');
    rememberLastMargins('both');
    expect(localStorage.getItem('studyDesk.lastMargins')).toBe('both');
    rememberPullTarget('left');
    expect(localStorage.getItem('studyDesk.pullTarget')).toBe('left');
    setSnapEnabled(false);
    expect(localStorage.getItem('studyDesk.pdfSnap')).toBe('off');
    setSnapEnabled(true);
    expect(localStorage.getItem('studyDesk.pdfSnap')).toBe('on');
    rememberCurrentDeskId('book-1', 'desk-9');
    expect(localStorage.getItem('studyDesk.current.book-1')).toBe('desk-9');
  });

  it('falls back to the defaults when nothing, or something unknown, is stored', () => {
    expect(docPanelMinimised()).toBe(false);
    expect(lastMargins()).toBeNull();
    expect(pullTarget()).toBe('right');
    expect(snapEnabled()).toBe(true);
    localStorage.setItem('studyDesk.docPanelMin', 'yes');
    localStorage.setItem('studyDesk.lastMargins', 'off');
    localStorage.setItem('studyDesk.pullTarget', 'middle');
    localStorage.setItem('studyDesk.pdfSnap', 'maybe');
    expect(docPanelMinimised()).toBe(false);
    expect(lastMargins()).toBeNull();
    expect(pullTarget()).toBe('right');
    expect(snapEnabled()).toBe(true);
  });
});
