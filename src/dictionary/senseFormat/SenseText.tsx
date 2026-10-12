import './senseText.css';
import { Fragment, type ReactNode } from 'react';
import type { ItalicSpan } from './laneItalics';
import { senseSegments, type SenseStyle } from './senseRuns';

/**
 * `text.slice(from, to)` of an English-language sense line, as inline elements (never HTML): each Arabic run in a
 * right-to-left <bdi> in the reading font, Lane's meanings in <em>, its source sigla and Hans Wehr's
 * transliteration in their own spans. The text itself is unchanged.
 */
export function SenseText({ text, style, spans, from = 0, lead = true }: { text: string; style: SenseStyle; spans?: ItalicSpan[]; from?: number; lead?: boolean }) {
  const nodes: ReactNode[] = senseSegments(text, { style, spans, from, lead }).map((seg, i) => {
    const inner: ReactNode = seg.arabic ? (
      <bdi dir="rtl" lang="ar" className={'dict-sense-ar' + (seg.lead ? ' dict-sense-lead' : '')}>
        {seg.text}
      </bdi>
    ) : (
      seg.text
    );
    if (seg.kind === 'italic')
      return (
        <em key={i} className="dict-lane-meaning">
          {inner}
        </em>
      );
    if (seg.kind === 'sigla')
      return (
        <span key={i} className="dict-lane-sigla">
          {inner}
        </span>
      );
    if (seg.kind === 'translit')
      return (
        <span key={i} className="dict-hw-translit">
          {inner}
        </span>
      );
    return <Fragment key={i}>{inner}</Fragment>;
  });
  return <>{nodes}</>;
}
