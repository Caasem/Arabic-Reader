import { useEffect, type ReactNode } from 'react';
import type { DeskItem } from '../studyDesk/types';
import { stripBox } from './geometry';
import { ago, citeOf, short, thoughtText } from './passages';
import { setThinking } from './state';
import type { Touch } from './touching';

const REL: Record<string, string> = { same: 'Same text', supports: 'Supports', differs: 'Differs', explains: 'Explains', quotes: 'Quotes' };

/**
 * "Touching this passage", in the Ḥāshiya strip: what the badge counted, each as a margin card. Parts after backlinks
 * add their own actions to the cards (`actions`).
 */
export function TouchingPanel({
  passage,
  touches,
  onGoTo,
  actions,
}: {
  passage: DeskItem;
  touches: Touch[];
  onGoTo(item: DeskItem): void;
  actions?: (t: Touch) => ReactNode;
}) {
  const box = stripBox();
  const close = () => setThinking({ touch: null });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if ((e.target as HTMLElement | null)?.closest?.('input, textarea, [contenteditable="true"]')) return;
      e.stopPropagation();
      close();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);
  const source = (item: DeskItem) =>
    item.source?.location ? (
      <button type="button" className="th-src" title={`Go to ${citeOf(item)}`} onClick={() => onGoTo(item)}>
        <bdi>{citeOf(item) || 'Go to'}</bdi>
      </button>
    ) : null;
  return (
    <aside className="th-touch" aria-label="Touching this passage" style={{ left: box.left, top: box.top + 8, width: box.right - box.left, maxHeight: box.bottom - box.top - 16 }}>
      <div className="th-touch__head">
        <h3>Touching this passage</h3>
        <button type="button" className="th-link" onClick={close}>
          Back to the Ḥāshiya
        </button>
      </div>
      <p className={'th-excerpt' + (passage.ar ? ' th-ar' : '')} dir="auto">
        {short(passage.text, 120)}
      </p>
      {!touches.length && <p className="th-empty">Nothing touches it yet.</p>}
      {touches.map((t) => {
        if (t.kind === 'link')
          return (
            <div key={'l' + t.link.id} className="th-card th-card--link">
              <div className="th-card__top">
                <span className="th-kind th-kind--link">Muqābala · {REL[t.link.rel]}</span>
                {source(t.other)}
              </div>
              <p className={'th-excerpt' + (t.other.ar ? ' th-ar' : '')} dir="auto">
                {short(t.other.text, 90)}
              </p>
              {t.link.note && <p className="th-card__text">{t.link.note}</p>}
              {actions?.(t)}
            </div>
          );
        const item = t.item;
        const label = t.kind === 'gloss' ? 'Your gloss' : t.kind === 'question' ? (item.answer ? 'Masʾala · answered' : 'Masʾala · open') : 'Thought';
        const words = t.kind === 'gloss' ? (item.body ?? '') : t.kind === 'question' ? item.text : thoughtText(item);
        return (
          <div key={t.kind + item.id} className={'th-card' + (t.kind === 'question' ? ' th-card--q' : '')}>
            <div className="th-card__top">
              <span className={'th-kind ' + (t.kind === 'question' ? 'th-kind--q' : 'th-kind--note')}>{label}</span>
              {t.kind === 'thought' && t.via && <span className="th-faint th-card__via">linked from your thought</span>}
              {t.kind !== 'gloss' && source(item)}
            </div>
            <p className={'th-card__text' + (item.ar ? ' th-ar' : '')} dir="auto">
              {words}
            </p>
            <p className="th-line__meta">
              {t.kind === 'question' ? (t.answers ? 'answered by this passage' : `asked ${ago(item.createdAt)}`) : item.versions?.length ? `v${item.versions.length + 1} · revised` : `written ${ago(item.createdAt)}`}
            </p>
            {actions?.(t)}
          </div>
        );
      })}
    </aside>
  );
}
