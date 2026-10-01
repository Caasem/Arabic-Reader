import { useEffect, useLayoutEffect } from 'react';
import { usePreferences } from '../state/PreferencesContext';
import { DEFAULT_PREFS } from '../state/defaultPreferences';
import { isUploadedStack } from './fontStack';
import { loadUserFonts } from './userFonts';

/**
 * Mounted once in App. Loads uploaded fonts when one is in use, and with
 * "Use for all Arabic text" on, points the app's --font-arabic at the pick.
 */
export function ReadingFontSync() {
  const { prefs } = usePreferences();
  const { fontFamily, readingFontAppWide } = prefs;

  useEffect(() => {
    if (isUploadedStack(fontFamily)) void loadUserFonts();
  }, [fontFamily]);

  useLayoutEffect(() => {
    const root = document.documentElement;
    if (readingFontAppWide && fontFamily !== DEFAULT_PREFS.fontFamily) {
      root.style.setProperty('--font-arabic', fontFamily);
      root.dataset.arabicFont = 'picked';
    } else {
      root.style.removeProperty('--font-arabic');
      delete root.dataset.arabicFont;
    }
  }, [fontFamily, readingFontAppWide]);

  return null;
}
