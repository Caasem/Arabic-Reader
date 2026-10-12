import './senseText.css';
import { Fragment, type PointerEvent, type ReactNode } from 'react';
import type { DefinitionToken } from '../../components/reader/definitionTokens';
import type { ItalicSpan } from './laneItalics';
import { senseSegments, type SenseStyle } from './senseRuns';

/** Makes the words of a sense line pickable: each word of `tokens` is drawn as a token span, inside whatever styled run it sits in. */
export interface WordPicking {
  /** The line's tokens (see buildEntryTokens), each knowing where it starts in the line's text. */
  tokens: DefinitionToken[];
  entryIdx: number;
  selected?: ReadonlySet<number>;
  onPointerDown: (entryIdx: number, idx: number, e: PointerEvent) => void;
}

/**
 * `text.slice(from, to)` of an English-language sense line, as inline elements (never HTML): each Arabic run in a
 * right-to-left <bdi> in the reading font, Lane's meanings in <em>, its source sigla and Hans Wehr's
 * transliteration in their own spans. The text itself is unchanged. With `picking`, each word is also a token
 * span that can be selected; the token sits inside the styled run, so the run keeps its look.
 */
export function SenseText({
  text,
  style,
  spans,
  from = 0,
  lead = true,
  picking,
}: {
  text: string;
  style: SenseStyle;
  spans?: ItalicSpan[];
  from?: number;
  lead?: boolean;
  picking?: WordPicking;
}) {
  let next = 0; // the first token that may still overlap the next segment
  const nodes: ReactNode[] = [];
  let pos = from;
  senseSegments(text, { style, spans, from, lead }).forEach((seg, i) => {
    const start = pos;
    const end = (pos += seg.text.length);
    let content: ReactNode = seg.text;
    if (picking) {
      const pieces: ReactNode[] = [];
      const { tokens } = picking;
      while (next < tokens.length && tokens[next].at + tokens[next].text.length <= start) next++;
      for (let t = next; t < tokens.length && tokens[t].at < end; t++) {
        const token = tokens[t];
        const piece = text.slice(Math.max(token.at, start), Math.min(token.at + token.text.length, end));
        if (!piece) continue;
        pieces.push(
          token.isWord ? (
            <span
              key={token.globalIdx}
              data-entry={picking.entryIdx}
              data-idx={token.globalIdx}
              className={'dict-popup__token' + (picking.selected?.has(token.globalIdx) ? ' dict-popup__token--selected' : '')}
              onPointerDown={(e) => picking.onPointerDown(picking.entryIdx, token.globalIdx, e)}
            >
              {piece}
            </span>
          ) : (
            <Fragment key={token.globalIdx}>{piece}</Fragment>
          ),
        );
      }
      content = pieces;
    }
    const inner: ReactNode = seg.arabic ? (
      <bdi dir="rtl" lang="ar" className={'dict-sense-ar' + (seg.lead ? ' dict-sense-lead' : '')}>
        {content}
      </bdi>
    ) : (
      content
    );
    if (seg.kind === 'italic')
      nodes.push(
        <em key={i} className="dict-lane-meaning">
          {inner}
        </em>,
      );
    else if (seg.kind === 'sigla')
      nodes.push(
        <span key={i} className="dict-lane-sigla">
          {inner}
        </span>,
      );
    else if (seg.kind === 'translit')
      nodes.push(
        <span key={i} className="dict-hw-translit">
          {inner}
        </span>,
      );
    else nodes.push(<Fragment key={i}>{inner}</Fragment>);
  });
  return <>{nodes}</>;
}
