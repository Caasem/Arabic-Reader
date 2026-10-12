import './laneItalics.css';
import { italicPieces, type ItalicSpan } from './laneItalics';

/** `text.slice(from, to)` with Lane's italic spans (the English meanings) set in <em>. Built as elements, never as HTML. */
export function LaneMeaning({ text, spans, from = 0, to = text.length }: { text: string; spans?: ItalicSpan[]; from?: number; to?: number }) {
  if (!spans?.length) return <>{from === 0 && to === text.length ? text : text.slice(from, to)}</>;
  return (
    <>
      {italicPieces(text, spans, from, to).map((p, i) =>
        p.italic ? (
          <em key={i} className="dict-lane-meaning">
            {p.text}
          </em>
        ) : (
          p.text
        ),
      )}
    </>
  );
}
