import type { ReaderPreferences } from '../types';

/** The thinking desk is on: its own switch, and the study desk it builds on. */
export const thinkingOn = (prefs: ReaderPreferences): boolean => prefs.thinkingFrontEnabled && prefs.studyDeskEnabled;
