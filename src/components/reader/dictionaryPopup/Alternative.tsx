import { useEffect, useState } from 'react';
import { senseText } from '../../../dictionary/senseText';
import { dictionaryManager } from '../../../dictionary';

/** One correction offered for a misread word, with its first meaning so it can be chosen at a glance. */
export function Alternative({ word, why, index, onPick }: { word: string; why: string; index: number; onPick: (word: string) => void }) {
  const [gloss, setGloss] = useState('');
  useEffect(() => {
    let cancelled = false;
    void dictionaryManager
      .lookup(word)
      .then((r) => {
        const sense = r.entries[0]?.senses[0];
        if (!cancelled && sense) setGloss(senseText(sense));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [word]);
  return (
    <button type="button" className={'dict-popup__alt' + (index === 0 ? ' dict-popup__alt--top' : '')} onClick={() => onPick(word)}>
      <span className="dict-popup__alt-word" lang="ar" dir="rtl">
        {word}
      </span>
      <span className="dict-popup__alt-gloss">{gloss}</span>
      <kbd className="dict-popup__alt-key">{index + 1}</kbd>
      <span className="dict-popup__alt-why">{why}</span>
    </button>
  );
}
