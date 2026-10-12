import type { ReactNode } from 'react';
import type { DefinitionToken } from '../../components/reader/definitionTokens';
import './sihahVerses.css';
import { verseLines, type Verse } from './sihahVerses';

/**
 * A sense line's word tokens with its verses set apart: each verse line on its own indented row, its two halves side by
 * side, the stars hidden. `renderToken` draws one word, so words in verses stay selectable. Built as elements.
 */
export function verseNodes(tokens: DefinitionToken[], verses: Verse[], renderToken: (t: DefinitionToken) => ReactNode): ReactNode[] {
  const lines = verses.flatMap(verseLines);
  const offsets: number[] = [];
  let at = 0;
  for (const t of tokens) {
    offsets.push(at);
    at += t.text.length;
  }

  const out: ReactNode[] = [];
  let i = 0;
  lines.forEach((line, li) => {
    const from = line[0].start;
    const to = line[line.length - 1].next;
    while (i < tokens.length && offsets[i] < from) out.push(renderToken(tokens[i++]));
    const halves: ReactNode[][] = line.map(() => []);
    for (; i < tokens.length && offsets[i] < to; i++) {
      const t = tokens[i];
      if (t.text === '*') continue;
      if (!t.isWord && !halves.some((h) => h.length)) continue;
      const half = line.length > 1 && offsets[i] >= line[1].start ? 1 : 0;
      halves[half].push(renderToken(t));
    }
    out.push(
      <span className="sihah-verse" key={'v' + li}>
        {halves.map((h, hi) => (
          <span className="sihah-verse__half" key={hi}>
            {h}
          </span>
        ))}
      </span>,
    );
  });
  while (i < tokens.length) out.push(renderToken(tokens[i++]));
  return out;
}
