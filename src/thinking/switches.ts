import type { ReaderPreferences } from '../types';

/** The thinking desk is on: its own switch, and the study desk it builds on. */
/** The five argument moves (and the Argument tab) are on. They give way to the argument layer (src/arguments) while that is on. */
export const movesOn = (prefs: Pick<ReaderPreferences, 'thinkingMoves' | 'argumentsEnabled'>): boolean => prefs.thinkingMoves && !prefs.argumentsEnabled;

export const thinkingOn = (prefs: ReaderPreferences): boolean => prefs.thinkingFrontEnabled && prefs.studyDeskEnabled;
