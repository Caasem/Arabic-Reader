import { Segmented, ThemePicker } from '../../quietReader/DisplaySheet';
import { IconChevronRight, IconClose } from '../../quietReader/icons';
import { usePreferences } from '../../state/PreferencesContext';
import type { PageDirection } from '../../types';

export const ZOOM_MIN = 0.6;
export const ZOOM_MAX = 3;
export const ZOOM_STEP = 0.2;

const TINTS = [
  { id: 'paper', label: 'Paper' },
  { id: 'sepia', label: 'Sepia' },
  { id: 'night', label: 'Night' },
] as const;

const DIRECTIONS: { id: PageDirection; label: string }[] = [
  { id: 'auto', label: 'Automatic' },
  { id: 'rtl', label: 'RTL' },
  { id: 'ltr', label: 'LTR' },
];

/** The PDF pages' Display (the dock's Aa): zoom, how the pages are tinted, the theme, page turns, and text or pages. */
export function PdfDisplaySheet({
  center,
  zoom,
  onZoom,
  onShowText,
  onOpenSettings,
  onClose,
}: {
  center: number;
  zoom: number;
  onZoom(zoom: number): void;
  /** The book's text reflowed: switch to it. */
  onShowText?(): void;
  onOpenSettings(): void;
  onClose(): void;
}) {
  const { prefs, updatePrefs } = usePreferences();
  const clamp = (z: number) => Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z)) * 100) / 100;
  return (
    <section className="qr-sheet qr-display" role="dialog" aria-label="Display" style={{ left: center }}>
      <div className="qr-sheet__head">
        <h3 className="qr-sheet__title">Display</h3>
        <button type="button" className="qr-close" onClick={onClose} aria-label="Close display settings">
          <IconClose />
        </button>
      </div>
      <div className="qr-display__grid">
        <div className="qr-display__col">
          <div>
            <div className="qr-label">Zoom</div>
            <div className="qr-stepper">
              <button type="button" className="qr-stepper__btn" aria-label="Zoom out" title="Zoom out (Ctrl -)" disabled={zoom <= ZOOM_MIN} onClick={() => onZoom(clamp(zoom - ZOOM_STEP))}>
                −
              </button>
              <div className="qr-stepper__value">{Math.round(zoom * 100)}%</div>
              <button type="button" className="qr-stepper__btn" aria-label="Zoom in" title="Zoom in (Ctrl +)" disabled={zoom >= ZOOM_MAX} onClick={() => onZoom(clamp(zoom + ZOOM_STEP))}>
                +
              </button>
            </div>
            <div className="qr-display__font-row">
              <button type="button" className="qr-chip-btn" onClick={() => onZoom(1)} disabled={zoom === 1}>
                Fit to width
              </button>
              <span className="qr-display__hint">Ctrl + wheel zooms too</span>
            </div>
          </div>
          <Segmented label="Pages" options={[...TINTS]} value={prefs.pdfPageTint} onChange={(pdfPageTint) => updatePrefs({ pdfPageTint })} />
          <ThemePicker />
        </div>

        <div className="qr-display__col qr-display__col--page">
          <Segmented label="Page turns" options={DIRECTIONS} value={prefs.pageDirection} onChange={(pageDirection) => updatePrefs({ pageDirection })} />
          {onShowText && (
            <Segmented
              label="PDF"
              options={[
                { id: 'text', label: 'Reflowed text' },
                { id: 'pages', label: 'Original pages' },
              ]}
              value="pages"
              onChange={(v) => v === 'text' && onShowText()}
            />
          )}
          <div className="qr-display__foot">
            <span />
            <button type="button" className="qr-link" onClick={onOpenSettings}>
              All reading settings
              <IconChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
