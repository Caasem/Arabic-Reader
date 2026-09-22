import { SAVED_WORD_COLOR } from '../../theme/tokens';

const STYLE_ID = 'ar-word-style';

function wordCss(dark: boolean): string {
  return `
  /* touch-action: manipulation keeps the browser's double-tap-to-zoom from
     resizing the viewport (and making epub.js re-layout) mid-gesture.
     -webkit-touch-callout: none stops iOS's own tap-to-select callout from
     swallowing word taps; user-select stays on for drag-to-highlight. */
  html, body { touch-action: manipulation; }
  .ar-word { cursor: pointer; border-radius: 3px; transition: background 0.1s ease; touch-action: manipulation; -webkit-touch-callout: none; }
  .ar-word:hover { background: rgba(156, 122, 79, 0.18); }
  .ar-word--saved { color: ${dark ? SAVED_WORD_COLOR.dark : SAVED_WORD_COLOR.light}; }
  .ar-word--jump-flash { background: rgba(230, 170, 60, 0.55) !important; }
`;
}

/** Word styling inside one section document (sections don't inherit host CSS). */
export function applyWordStyle(doc: Document, dark: boolean): void {
  let style = doc.getElementById(STYLE_ID);
  if (!style) {
    style = doc.createElement('style');
    style.id = STYLE_ID;
    doc.head.appendChild(style);
  }
  style.textContent = wordCss(dark);
}

/** Re-themes every rendered section in place, so a theme switch doesn't wait
 * for the next page turn. */
export function refreshWordStyles(container: ParentNode | null, dark: boolean): void {
  container?.querySelectorAll('iframe').forEach((frame) => {
    const doc = frame.contentDocument;
    if (doc?.getElementById(STYLE_ID)) applyWordStyle(doc, dark);
  });
}
