import { useEffect, useState } from 'react';
import { usePreferences } from '../state/PreferencesContext';
import { aramorphProvider } from '../dictionary/providers/aramorph/AramorphDictionaryProvider';
import type { DictionaryEntry, VerbFamilyMember } from '../types';

/** What the dictionary marks for a Form I verb's imperfect (`u` -> yaf'ulu); two letters mean either. */
function vowelLabel(vowel: string): string {
  return vowel.split('').join(' or ');
}

/**
 * The verb form as plain text (a Roman numeral) on the headword's row, just
 * after its dictionary form. Renders nothing for non-verbs or when switched off.
 */
export function VerbFormMark({ entry }: { entry: DictionaryEntry }) {
  const { prefs } = usePreferences();
  if (!prefs.verbFormsEnabled || !entry.verbForm) return null;
  return (
    <span className="verb-forms__mark" dir="ltr" title={`Verb form ${entry.verbForm}`} aria-label={`Verb form ${entry.verbForm}`}>
      {entry.verbForm}
    </span>
  );
}

interface Props {
  entry: DictionaryEntry;
  /** Clean popup layout: no row or link; the popup owns `open` (tapping the verb) and this only draws the list. */
  clean?: boolean;
  open?: boolean;
}

/**
 * Under a verb's headword in the dictionary popup: which form (I-X) it is,
 * and, on request, the other verbs the dictionary lists for the same root.
 * Renders nothing for non-verbs or when switched off in Settings.
 */
export function VerbFormInfo({ entry, clean = false, open: openProp = false }: Props) {
  const { prefs } = usePreferences();
  const [family, setFamily] = useState<VerbFamilyMember[] | null>(null);
  const [openOwn, setOpenOwn] = useState(false);
  const [failed, setFailed] = useState(false);
  const open = clean ? openProp : openOwn;
  const root = entry.root;

  useEffect(() => {
    if (!open || family || !root) return;
    let stale = false;
    aramorphProvider
      .verbFamily(root)
      .then((members) => !stale && setFamily(members))
      .catch(() => !stale && setFailed(true));
    return () => {
      stale = true;
    };
  }, [open, family, root]);

  if (!prefs.verbFormsEnabled || !entry.verbForm) return null;

  const list = open && (
    <ul className="verb-forms__list">
      {failed && <li className="verb-forms__note">Could not load the forms.</li>}
      {!failed && !family && <li className="verb-forms__note">Loading…</li>}
      {family && family.length === 0 && <li className="verb-forms__note">The dictionary lists no other verbs for this root.</li>}
      {family?.map((m, i) => (
        <li key={m.lemma + i} className={'verb-forms__item' + (m.lemma === entry.lemma ? ' verb-forms__item--current' : '')}>
          <span className="verb-forms__numeral">{m.form ?? '·'}</span>
          <bdi className="verb-forms__lemma" lang="ar" dir="rtl">
            {m.lemma}
          </bdi>
          <span className="verb-forms__gloss">{m.gloss}</span>
        </li>
      ))}
    </ul>
  );

  if (clean) return <div className="verb-forms verb-forms--clean">{list}</div>;

  return (
    <div className="verb-forms">
      <div className="verb-forms__row">
        {entry.imperfectVowel && <span className="verb-forms__vowel">imperfect with {vowelLabel(entry.imperfectVowel)}</span>}
        {root && (
          <button type="button" className="verb-forms__toggle" aria-expanded={open} onClick={() => setOpenOwn(!openOwn)}>
            Other forms of{' '}
            <bdi lang="ar" dir="rtl">
              {root.split('').join(' ')}
            </bdi>{' '}
            {open ? '▴' : '▾'}
          </button>
        )}
      </div>
      {list}
    </div>
  );
}
