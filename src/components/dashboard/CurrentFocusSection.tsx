import type { VocabularyItem } from '../../types';
import './CurrentFocusSection.css';

export function CurrentFocusSection({ words }: { words: VocabularyItem[] | null }) {
  if (!words) return <div className="dash-empty">Loading…</div>;
  if (words.length === 0) {
    return (
      <div className="dash-empty">
        Nothing flagged as weak yet — words show up here once they've been looked up more than once without
        being recalled easily, or after a review lapse.
      </div>
    );
  }
  return (
    <div className="weak-vocab">
      {words.map((w) => (
        <div className="weak-vocab__pill" key={w.id} title={w.meaning}>
          <span className="weak-vocab__word">{w.surfaceForm}</span>
          <span className="weak-vocab__meaning">{w.meaning}</span>
          {w.fsrsLapses > 0 && <span className="weak-vocab__lapses">{w.fsrsLapses} lapse{w.fsrsLapses === 1 ? '' : 's'}</span>}
        </div>
      ))}
    </div>
  );
}
