import { computeOrpSplit } from '../../speedReader/orp';

/** The single central word displayed during RSVP playback. With ORP on,
 * splits the word into three pieces so the pivot letter stays visually
 * fixed regardless of word length — see speedReader/orp.ts for why this
 * never reverses or reorders the underlying string. Falls back to plain
 * centered text whenever a stable split isn't meaningful (short tokens,
 * punctuation-only tokens) or ORP is switched off. */
export function RsvpWord({ text, orpEnabled, fontScale }: { text: string; orpEnabled: boolean; fontScale: number }) {
  const split = orpEnabled ? computeOrpSplit(text) : null;

  const style: React.CSSProperties = {
    fontSize: `${fontScale}rem`,
  };

  if (!split) {
    return (
      <div className="rsvp-word rsvp-word--plain" style={style} dir="rtl">
        {text}
      </div>
    );
  }

  return (
    <div className="rsvp-word rsvp-word--orp" style={style} dir="rtl">
      <span className="rsvp-word__before">{split.before}</span>
      <span className="rsvp-word__pivot">{split.pivot}</span>
      <span className="rsvp-word__after">{split.after}</span>
    </div>
  );
}
