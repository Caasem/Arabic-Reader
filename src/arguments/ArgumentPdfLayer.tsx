import type { PdfPageContext } from '../pdf/pages/extensions';
import { usePreferences } from '../state/PreferencesContext';
import { parsePdfLocation } from '../studyDesk/pageGeometry';
import { rolesOf } from './roles';
import { useArg } from './store';

/**
 * Argument marks on a PDF page (a pages-view extension layer, src/pdf/pages/extensions.ts). A mark's place is the region the
 * Highlighter snapped to, so it is drawn as one block over that region, in the same look as marks in the reader's text
 * (Settings → Reading → Argument layer). Taps go through to the page.
 */
export function ArgumentPdfLayer({ book, page, width, height }: PdfPageContext) {
  const { mine, layers } = useArg();
  const { prefs } = usePreferences();
  if (!layers.marks) return null;
  const here = mine.flatMap((item) => {
    const at = item.source?.bookId === book.id ? parsePdfLocation(item.source.location) : null;
    return at && at.page === page && at.w > 0 && at.h > 0 ? [{ item, at }] : [];
  });
  if (!here.length) return null;
  return (
    <div className="qr-blocks qr-blocks--page" data-style={prefs.markStyle} aria-hidden="true">
      {here.map(({ item, at }) => {
        const roles = rolesOf({ role: item.argument!.role, for: item.argument!.for });
        return <div key={item.id} className={`qr-block qr-block--${roles[0]}${roles[1] ? ` qr-block--under-${roles[1]}` : ''}`} style={{ left: at.x * width, top: at.y * height, width: at.w * width, height: at.h * height }} />;
      })}
    </div>
  );
}
