import type { PdfPageContext } from '../pdf/pages/extensions';
import { usePreferences } from '../state/PreferencesContext';
import { parsePdfLocation } from '../studyDesk/pageGeometry';
import { TAG_BAND } from '../readerCore/markBlocks';
import { ROLE_BY_ID, rolesOf, tagOf } from './roles';
import { useArg } from './store';

/**
 * Argument marks on a PDF page (a pages-view extension layer, src/pdf/pages/extensions.ts). A mark's place is the region the
 * Highlighter snapped to, so it is drawn as one block over that region, in the same look as marks in the reader's text
 * (Settings → Reading → Argument layer). Taps go through to the page.
 */
export function ArgumentPdfLayer({ book, page, width, height }: PdfPageContext) {
  const { mine, layers, nums } = useArg();
  const { prefs } = usePreferences();
  if (!layers.marks) return null;
  const here = mine.flatMap((item) => {
    const at = item.source?.bookId === book.id ? parsePdfLocation(item.source.location) : null;
    return at && at.page === page && at.w > 0 && at.h > 0 ? [{ item, at }] : [];
  });
  if (!here.length) return null;
  return (
    <div className="qr-blocks qr-blocks--page" data-style={prefs.markStyle} data-tag={prefs.argumentsTag} aria-hidden="true">
      {here.map(({ item, at }) => {
        const roles = rolesOf({ role: item.argument!.role, for: item.argument!.for });
        // The box grows upward to make room for the label (not past the top of the page).
        const band = prefs.argumentsTag === 'off' ? 0 : Math.min(TAG_BAND, at.y * height);
        return (
          <div
            key={item.id}
            className={`qr-block qr-block--${roles[0]}${roles[1] ? ` qr-block--under-${roles[1]}` : ''}`}
            style={{ left: at.x * width, top: at.y * height - band, width: at.w * width, height: at.h * height + band }}
          >
            {band > 0 && <PdfTag text={`${nums.get(item.id) ?? ''} ${tagOf(item.argument!)}`.trim()} ini={ROLE_BY_ID[item.argument!.role].label[0]} />}
          </div>
        );
      })}
    </div>
  );
}

/** The label's markup is shared with the reader text (markBlocks.ts); this renders the same element in React. */
function PdfTag({ text, ini }: { text: string; ini: string }) {
  return (
    <span className="qr-tag">
      <span className="qr-tag__ini">{ini}</span>
      <span className="qr-tag__txt">{text}</span>
    </span>
  );
}
