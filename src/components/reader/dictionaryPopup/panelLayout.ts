import type { DictionaryPanelLayout } from '../../../types';

/**
 * The layout the popup actually draws for the chosen `dictionaryPanelLayout`: 'split' and 'tabs' only make
 * sense when more than one dictionary has an entry (`canSplit`); with one they fall back to 'merged'.
 */
export function effectivePanelLayout(chosen: DictionaryPanelLayout, canSplit: boolean): DictionaryPanelLayout {
  if (chosen === 'single') return 'single';
  if ((chosen === 'split' || chosen === 'tabs') && canSplit) return chosen;
  return 'merged';
}
