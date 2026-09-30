import { useLayoutEffect } from 'react';
import { usePreferences } from '../state/PreferencesContext';
import { buildLookCss } from './buildLookCss';
import { resolveLookColors } from './palettes';

const STYLE_ID = 'look-tokens';

function removeLook(): void {
  delete document.documentElement.dataset.look;
  document.getElementById(STYLE_ID)?.remove();
}

/**
 * Switches the redesign on: marks <html data-look>, which activates look.css,
 * and writes the chosen colours as CSS variables. Switching it off removes
 * both, so the original stylesheet shows through untouched.
 */
export function useLookSkin(): void {
  const { prefs } = usePreferences();
  const { lookEnabled, lookPalette, lookCustom } = prefs;

  useLayoutEffect(() => {
    if (!lookEnabled) {
      removeLook();
      return;
    }
    document.documentElement.dataset.look = 'ink';
    let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
    if (!style) {
      style = document.createElement('style');
      style.id = STYLE_ID;
      document.head.appendChild(style);
    }
    style.textContent = buildLookCss(resolveLookColors(lookPalette, lookCustom));
  }, [lookEnabled, lookPalette, lookCustom]);

  useLayoutEffect(() => removeLook, []);
}
