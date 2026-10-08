import { useRef } from 'react';
import { usePreferences } from '../state/PreferencesContext';
import { FONT_FILE_ACCEPT, useFontChoices } from '../readerFont';
import type { PageDirection, ReaderTheme } from '../types';
import { IconChevronRight, IconClose, IconUpload } from './icons';
import type { ReaderView } from './readerView';

const THEMES: { id: ReaderTheme; label: string }[] = [
  { id: 'light', label: 'Light' },
  { id: 'sepia', label: 'Sepia' },
  { id: 'dark', label: 'Night' },
  { id: 'system', label: 'System' },
];

type Layout = 'paged' | 'scrolled' | 'all';
const LAYOUTS: { id: Layout; label: string }[] = [
  { id: 'paged', label: 'Paged' },
  { id: 'scrolled', label: 'Scrolling' },
  { id: 'all', label: 'Scroll all' },
];

const DIRECTIONS: { id: PageDirection; label: string }[] = [
  { id: 'auto', label: 'Automatic' },
  { id: 'rtl', label: 'RTL' },
  { id: 'ltr', label: 'LTR' },
];

const VIEWS: { id: ReaderView; label: string }[] = [
  { id: 'clean', label: 'Clean text' },
  { id: 'original', label: 'Original layout' },
];

const FONT_MIN = 80;
const FONT_MAX = 160;
const FONT_STEP = 10;

function Segmented<T extends string>({
  label,
  options,
  value,
  disabled,
  onChange,
}: {
  label: string;
  options: { id: T; label: string }[];
  value: T;
  disabled?: boolean;
  onChange(value: T): void;
}) {
  return (
    <div>
      <div className="qr-label">{label}</div>
      <div className="qr-seg" role="group" aria-label={label}>
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            className={'qr-seg__btn' + (o.id === value ? ' qr-seg__btn--on' : '')}
            aria-pressed={o.id === value}
            disabled={disabled}
            onClick={() => onChange(o.id)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Everything about how the page looks, opened from the dock's Aa. */
export function DisplaySheet({
  center,
  view,
  onSetView,
  onOpenSettings,
  onShowPages,
  onClose,
}: {
  center: number;
  view: ReaderView;
  onSetView(view: ReaderView): void;
  onOpenSettings(): void;
  /** A book added from a PDF: switch to its original pages. */
  onShowPages?(): void;
  onClose(): void;
}) {
  const { prefs, updatePrefs } = usePreferences();
  const fonts = useFontChoices();
  const uploadRef = useRef<HTMLInputElement>(null);
  const layout: Layout = prefs.readingFlow === 'paginated' ? 'paged' : prefs.continuousScrollEnabled ? 'all' : 'scrolled';

  function setLayout(next: Layout) {
    if (next === 'paged') updatePrefs({ readingFlow: 'paginated' });
    else updatePrefs({ readingFlow: 'scrolled', continuousScrollEnabled: next === 'all' });
  }

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
            <div className="qr-label">Text size</div>
            <div className="qr-stepper">
              <button
                type="button"
                className="qr-stepper__btn"
                aria-label="Smaller text"
                disabled={prefs.fontSizePct <= FONT_MIN}
                onClick={() => updatePrefs({ fontSizePct: Math.max(FONT_MIN, prefs.fontSizePct - FONT_STEP) })}
              >
                A
              </button>
              <div className="qr-stepper__value">{prefs.fontSizePct}%</div>
              <button
                type="button"
                className="qr-stepper__btn qr-stepper__btn--large"
                aria-label="Larger text"
                disabled={prefs.fontSizePct >= FONT_MAX}
                onClick={() => updatePrefs({ fontSizePct: Math.min(FONT_MAX, prefs.fontSizePct + FONT_STEP) })}
              >
                A
              </button>
            </div>
          </div>

          <div>
            <div className="qr-label">Theme</div>
            <div className="qr-themes" role="group" aria-label="Theme">
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={'qr-theme' + (prefs.theme === t.id ? ' qr-theme--on' : '')}
                  aria-pressed={prefs.theme === t.id}
                  onClick={() => updatePrefs({ theme: t.id })}
                >
                  <span className={`qr-theme__swatch qr-theme__swatch--${t.id}`} lang="ar">
                    ع
                  </span>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="qr-label">Arabic font</div>
            <div className="qr-fonts" role="group" aria-label="Arabic font">
              {fonts.choices.map((f) => (
                <button
                  key={f.stack}
                  type="button"
                  className={'qr-font' + (f.stack === fonts.selected ? ' qr-font--on' : '')}
                  aria-pressed={f.stack === fonts.selected}
                  onClick={() => fonts.pick(f.stack)}
                >
                  <span className="qr-font__text">
                    <span className="qr-font__name">{f.label}</span>
                    <span className="qr-font__detail">{f.detail}</span>
                  </span>
                  <span className="qr-font__sample" dir="rtl" lang="ar" style={{ fontFamily: f.stack }}>
                    خَيْرُ جَلِيسٍ كِتَابُ
                  </span>
                </button>
              ))}
            </div>
            <div className="qr-display__font-row">
              <button type="button" className="qr-chip-btn" onClick={() => uploadRef.current?.click()} disabled={fonts.busy}>
                <IconUpload />
                {fonts.busy ? 'Adding…' : 'Upload a font…'}
              </button>
              <input
                ref={uploadRef}
                type="file"
                accept={FONT_FILE_ACCEPT}
                multiple
                hidden
                onChange={(e) => {
                  void fonts.upload(e.target.files).then(() => {
                    if (uploadRef.current) uploadRef.current.value = '';
                  });
                }}
              />
              <label className="qr-check">
                <input type="checkbox" checked={prefs.readingFontAppWide} onChange={(e) => updatePrefs({ readingFontAppWide: e.target.checked })} />
                All Arabic text
              </label>
            </div>
            {fonts.message && (
              <p className={'qr-display__message' + (fonts.message.error ? ' qr-display__message--error' : '')} role={fonts.message.error ? 'alert' : 'status'}>
                {fonts.message.text}
              </p>
            )}
          </div>
        </div>

        <div className="qr-display__col qr-display__col--page">
          <Segmented label="Layout" options={LAYOUTS} value={layout} onChange={setLayout} />
          <Segmented
            label="Columns"
            options={[
              { id: '1', label: '1 column' },
              { id: '2', label: '2 columns' },
            ]}
            value={prefs.twoColumnEnabled ? '2' : '1'}
            disabled={layout !== 'paged'}
            onChange={(v) => updatePrefs({ twoColumnEnabled: v === '2' })}
          />
          <label className="qr-range">
            <span className="qr-range__label">Width</span>
            <input
              type="range"
              min={50}
              max={100}
              step={5}
              value={prefs.readingWidthPct}
              onChange={(e) => updatePrefs({ readingWidthPct: Number(e.target.value) })}
            />
            <span className="qr-range__value">{prefs.readingWidthPct}%</span>
          </label>
          <label className="qr-range">
            <span className="qr-range__label">Line height</span>
            <input
              type="range"
              min={1.4}
              max={2.8}
              step={0.1}
              value={prefs.lineHeight}
              onChange={(e) => updatePrefs({ lineHeight: Math.round(Number(e.target.value) * 10) / 10 })}
            />
            <span className="qr-range__value">{prefs.lineHeight.toFixed(1)}</span>
          </label>
          <Segmented label="Page turns" options={DIRECTIONS} value={prefs.pageDirection} onChange={(pageDirection) => updatePrefs({ pageDirection })} />
          <Segmented label="View" options={VIEWS} value={view} onChange={onSetView} />
          {onShowPages && (
            <Segmented
              label="PDF"
              options={[
                { id: 'text', label: 'Reflowed text' },
                { id: 'pages', label: 'Original pages' },
              ]}
              value="text"
              onChange={(v) => v === 'pages' && onShowPages()}
            />
          )}
          <div className="qr-display__foot">
            <label className="qr-check">
              <input type="checkbox" checked={prefs.showPageBoundaries} onChange={(e) => updatePrefs({ showPageBoundaries: e.target.checked })} />
              End-of-page marker
            </label>
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
