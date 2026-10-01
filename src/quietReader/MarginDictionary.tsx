import { useEffect, useMemo, useRef, useState } from 'react';
import type { DictionaryEntry, VerbFamilyMember, VocabularyItem, WordRarity } from '../types';
import type { LookupState } from '../components/reader/hooks/useWordLookups';
import { buildEntryTokenSenses, reconstructSelection, type DefinitionToken } from '../components/reader/definitionTokens';
import { aramorphProvider } from '../dictionary/providers/aramorph/AramorphDictionaryProvider';
import { normalize } from '../reader/tokenizer/arabicTokenizer';
import { usePreferences } from '../state/PreferencesContext';
import { vocabularyService } from '../vocabulary';
import { getWordRarity, isRarityDataReady, TIER_LABELS } from '../vocabRarity/rarity';
import { findMatchedSenses, WASIT_MATCH_CLASS } from '../wasitMatch';
import { isTokenizedProvider } from '../dictionary/tokenizedProviders';
import { annotateEntry } from '../wasitStructure';
import { IconCheck, IconChevronDown, IconClose, IconCompare, IconPencil, IconPlus } from './icons';
import { statusOf, statusText } from './vocabStatus';
import '../components/reader/DictionaryPopup.css';

type Group = { providerId: string; providerName: string; entries: { entry: DictionaryEntry; index: number }[] };

function groupByProvider(entries: DictionaryEntry[]): Group[] {
  const groups: Group[] = [];
  entries.forEach((entry, index) => {
    const last = groups[groups.length - 1];
    if (last && last.providerId === entry.providerId) last.entries.push({ entry, index });
    else groups.push({ providerId: entry.providerId, providerName: entry.providerName, entries: [{ entry, index }] });
  });
  return groups;
}

function groupTitle(group: Group): string {
  if (group.providerId === 'aramorph') return 'English · AraMorph';
  if (group.providerId === 'alwasit') return 'Al-Mu‘jam al-Wasīṭ · Arabic';
  if (group.providerId === 'alsihah') return 'Al-Ṣiḥāḥ · Arabic';
  if (group.providerId === 'almaqayis') return 'Maqāyīs al-Lugha · Arabic';
  return group.providerName;
}

/**
 * "Form IV verb", "Noun"... AraMorph's `pos` is its raw affix analysis
 * ("qaroy/NOUN+ap/NSUFF_FEM_SG"), so only an unmistakable tag is named;
 * anything else shows no chip rather than a guess.
 */
function kindOf(entry: DictionaryEntry | undefined, pos: string | undefined): string {
  if (entry?.verbForm) return `Form ${entry.verbForm} verb`;
  if (!pos) return '';
  if (/NOUN_PROP/.test(pos)) return 'Proper noun';
  if (/\/ADJ/.test(pos)) return 'Adjective';
  if (/\/NOUN/.test(pos)) return 'Noun';
  if (/\/(PV|IV|CV)/.test(pos)) return 'Verb';
  return '';
}

/** "ش ر ق" from "شرق". */
const spaced = (root: string) => Array.from(root.replace(/\s+/g, '')).join(' ');

function entryNote(entry: DictionaryEntry, word: string): string {
  const sense = entry.senses[0];
  return [
    entry.headword && normalize(entry.headword) !== normalize(word) ? entry.headword : '',
    sense?.pos,
    sense?.gender,
    entry.verbForm ? `Form ${entry.verbForm}` : '',
    entry.imperfectVowel ? `imperfect with ${entry.imperfectVowel.split('').join(' or ')}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

interface Props {
  lookup: LookupState;
  bookId: string;
  /** Cards saved since the last status read, to refresh the status line. */
  savedVersion: number;
  onClose(): void;
  /** The header button: saves every entry, or (when saved) removes the word. */
  onToggleSave(): void;
  onSaveEntry(entry: DictionaryEntry): void;
  onSaveEntries(entries: DictionaryEntry[]): void;
  onSaveSelection(entry: DictionaryEntry, text: string): void;
  onEdit(): void;
  onLookUp(word: string): void;
}

/** The dictionary beside the text: the word, its root and form, every dictionary's entries, and saving. */
export function MarginDictionary({ lookup, bookId, savedVersion, onClose, onToggleSave, onSaveEntry, onSaveEntries, onSaveSelection, onEdit, onLookUp }: Props) {
  const { prefs, updatePrefs } = usePreferences();
  const { word, result, instance, saved, loading } = lookup;

  const [savedEntries, setSavedEntries] = useState<Set<string>>(new Set());
  const [folded, setFolded] = useState<Set<number>>(new Set());
  const [rootOpen, setRootOpen] = useState(true);
  const [selections, setSelections] = useState<Map<number, Set<number>>>(new Map());
  const [activeSelection, setActiveSelection] = useState<number | null>(null);
  const [items, setItems] = useState<VocabularyItem[]>([]);
  const [rarity, setRarity] = useState<WordRarity | null>(null);
  const [family, setFamily] = useState<{ root: string; members: VerbFamilyMember[] } | null>(null);

  // Per-word state starts fresh for each looked-up word.
  const [shownWord, setShownWord] = useState(word);
  if (shownWord !== word) {
    setShownWord(word);
    setSavedEntries(new Set());
    setFolded(new Set());
    setSelections(new Map());
    setActiveSelection(null);
  }

  useEffect(() => {
    let stale = false;
    void vocabularyService.getForWord(bookId, word).then((list) => !stale && setItems(list));
    return () => {
      stale = true;
    };
  }, [bookId, word, saved, savedVersion]);

  const morphology = result?.morphology?.[0];
  useEffect(() => {
    let stale = false;
    setRarity(null);
    void isRarityDataReady().then((ready) => {
      if (!ready || stale) return;
      void getWordRarity(normalize(word), morphology?.pos, morphology?.lemma).then((r) => !stale && setRarity(r));
    });
    return () => {
      stale = true;
    };
  }, [word, morphology?.pos, morphology?.lemma]);

  const entries = useMemo(() => result?.entries ?? [], [result]);
  const lead = entries.find((e) => e.verbForm) ?? entries.find((e) => e.root) ?? entries[0];
  const root = lead?.root ?? morphology?.root;
  useEffect(() => {
    if (!root || !prefs.verbFormsEnabled || !rootOpen || family?.root === root) return;
    let stale = false;
    aramorphProvider
      .verbFamily(root)
      .then((members) => !stale && setFamily({ root, members }))
      .catch(() => !stale && setFamily({ root, members: [] }));
    return () => {
      stale = true;
    };
  }, [root, prefs.verbFormsEnabled, rootOpen, family?.root]);

  const allGroups = groupByProvider(entries);
  const layout = prefs.dictionaryPanelLayout;
  const groups =
    layout === 'single'
      ? (allGroups.filter((g) => g.providerId === prefs.dictionaryPanelSingleProviderId).length
          ? allGroups.filter((g) => g.providerId === prefs.dictionaryPanelSingleProviderId)
          : allGroups.slice(0, 1))
      : allGroups;
  const canCompare = layout !== 'single' && allGroups.length > 1;
  const compare = canCompare && layout === 'split';

  const tokenData = useMemo(() => {
    const map = new Map<number, { flat: DefinitionToken[]; bySense: DefinitionToken[][] }>();
    entries.forEach((e, i) => isTokenizedProvider(e.providerId) && map.set(i, buildEntryTokenSenses(e)));
    return map;
  }, [entries]);
  const structure = useMemo(() => {
    const map = new Map<number, ReturnType<typeof annotateEntry>>();
    if (prefs.wasitStructureEnabled) entries.forEach((e, i) => e.providerId === 'alwasit' && map.set(i, annotateEntry(e)));
    return map;
  }, [entries, prefs.wasitStructureEnabled]);
  const matches = useMemo(() => {
    const map = new Map<number, Set<number>>();
    if (prefs.wasitMatchHighlight) entries.forEach((e, i) => isTokenizedProvider(e.providerId) && map.set(i, findMatchedSenses(e, word, result?.morphology)));
    return map;
  }, [entries, word, result?.morphology, prefs.wasitMatchHighlight]);

  // Select-and-save inside an Al-Wasit entry: click a word to toggle it, drag to add a run.
  const drag = useRef<{ entry: number; idx: number; moved: boolean } | null>(null);
  function toggleToken(entry: number, idx: number) {
    setSelections((prev) => {
      const next = new Map(prev);
      const set = new Set(next.get(entry) ?? []);
      if (!set.delete(idx)) set.add(idx);
      if (set.size) next.set(entry, set);
      else next.delete(entry);
      return next;
    });
    setActiveSelection(entry);
  }
  function addRange(entry: number, lo: number, hi: number) {
    const tokens = tokenData.get(entry)?.flat;
    if (!tokens) return;
    setSelections((prev) => {
      const next = new Map(prev);
      const set = new Set(next.get(entry) ?? []);
      for (let i = lo; i <= hi; i++) if (tokens[i]?.isWord) set.add(i);
      next.set(entry, set);
      return next;
    });
    setActiveSelection(entry);
  }
  useEffect(() => {
    const stop = () => {
      const d = drag.current;
      if (d && !d.moved) toggleToken(d.entry, d.idx);
      drag.current = null;
    };
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    return () => {
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  function onTokensMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const el = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest<HTMLElement>('[data-idx]');
    if (!el || Number(el.dataset.entry) !== d.entry) return;
    const idx = Number(el.dataset.idx);
    if (idx === d.idx && !d.moved) return;
    d.moved = true;
    addRange(d.entry, Math.min(d.idx, idx), Math.max(d.idx, idx));
  }
  const selectedCount = activeSelection !== null ? (selections.get(activeSelection)?.size ?? 0) : 0;
  function saveSelection(entryIndex: number) {
    const sel = selections.get(entryIndex);
    const tokens = tokenData.get(entryIndex)?.flat;
    if (!sel?.size || !tokens) return;
    onSaveSelection(entries[entryIndex], reconstructSelection(tokens, sel));
    setSelections((prev) => {
      const next = new Map(prev);
      next.delete(entryIndex);
      return next;
    });
    setActiveSelection(null);
  }

  function addEntries(key: string, list: DictionaryEntry[]) {
    if (list.length === 1) onSaveEntry(list[0]);
    else onSaveEntries(list);
    setSavedEntries((prev) => new Set(prev).add(key));
  }

  function primary() {
    if (selectedCount > 0 && activeSelection !== null) saveSelection(activeSelection);
    else if (saved) onEdit();
    else onToggleSave();
  }

  const status = statusOf(items);
  const kind = kindOf(lead, morphology?.pos);
  const lemma = lead?.lemma && normalize(lead.lemma) !== normalize(word) ? lead.lemma : '';
  const sentence = instance?.sentence;
  const at = sentence ? sentence.indexOf(word) : -1;
  const encounters = instance?.encounterCount ?? 1;
  const lookups = instance?.lookupCount ?? 1;

  function renderGroup(group: Group) {
    const isTokenized = isTokenizedProvider(group.providerId);
    const groupKey = `g:${group.providerId}`;
    return (
      <section key={group.providerId} className="qr-dict__section">
        <div className="qr-dict__section-head">
          <h4 className="qr-dict__section-title">{groupTitle(group)}</h4>
          {isTokenized && (
            <button
              type="button"
              className="qr-add-sm"
              disabled={savedEntries.has(groupKey)}
              onClick={() => addEntries(groupKey, group.entries.map((e) => e.entry))}
              aria-label="Add just this section"
              title={savedEntries.has(groupKey) ? 'Added' : 'Add just this section'}
            >
              {savedEntries.has(groupKey) ? <IconCheck size={14} /> : <IconPlus />}
            </button>
          )}
        </div>
        {group.entries.map(({ entry, index }) => {
          const tokens = tokenData.get(index);
          if (!isTokenized || !tokens) {
            const key = `e:${index}`;
            return (
              <div key={index} className="qr-dict__entry">
                <div className="qr-dict__entry-text">
                  <div className="qr-dict__gloss">{entry.senses.map((s) => s.gloss).join('; ')}</div>
                  {entryNote(entry, word) && (
                    <div className="qr-dict__note">
                      <bdi>{entryNote(entry, word)}</bdi>
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  className="qr-add-sm"
                  disabled={savedEntries.has(key)}
                  onClick={() => addEntries(key, [entry])}
                  aria-label="Add just this definition"
                  title={savedEntries.has(key) ? 'Added' : 'Add just this definition'}
                >
                  {savedEntries.has(key) ? <IconCheck size={14} /> : <IconPlus />}
                </button>
              </div>
            );
          }
          const isFolded = folded.has(index);
          const sel = selections.get(index);
          // Al-Wasit's lead senses with their continuations, each with its own add when there are several.
          // The other root-keyed dictionaries have no such structure: one group, so no per-line add.
          const subGroups: number[][] = [];
          if (entry.providerId !== 'alwasit') subGroups.push(entry.senses.map((_, si) => si));
          else
            entry.senses.forEach((_, si) => {
              const s = structure.get(index)?.[si];
              if (!subGroups.length || s?.isLead || !s?.isContinuation) subGroups.push([si]);
              else subGroups[subGroups.length - 1].push(si);
            });
          return (
            <div key={index} className="qr-dict__wasit" dir="rtl" lang="ar">
              <button
                type="button"
                className="qr-dict__headword"
                aria-expanded={!isFolded}
                title={isFolded ? 'Show the definition' : 'Hide the definition'}
                onClick={() =>
                  setFolded((prev) => {
                    const next = new Set(prev);
                    if (!next.delete(index)) next.add(index);
                    return next;
                  })
                }
              >
                {entry.headword}
                <span className={'qr-dict__chevron' + (isFolded ? ' qr-dict__chevron--folded' : '')}>
                  <IconChevronDown />
                </span>
              </button>
              {!isFolded && (
                <div
                  className={'qr-dict__tokens' + (structure.get(index) && prefs.wasitStructureExamples === 'dim' ? ' wasit-examples--dim' : '')}
                  onPointerMove={onTokensMove}
                >
                  {subGroups.map((group, gi) => {
                    const subKey = `s:${index}:${gi}`;
                    return (
                      <div key={gi} className="qr-dict__sub">
                        <div className="qr-dict__sub-body">
                          {group.map((si) => {
                            const s = structure.get(index)?.[si];
                            let wordNo = 0;
                            return (
                              <div
                                key={si}
                                className={'dict-popup__token-sense' + (s?.isLead ? ' wasit-sense--lead' : '') + (s?.isContinuation ? ' wasit-sense--cont' : '')}
                              >
                                {tokens.bySense[si].map((t) => {
                                  if (!t.isWord) return <span key={t.globalIdx}>{t.text}</span>;
                                  const role = s?.words[wordNo++];
                                  const firstWord = t === tokens.bySense[si].find((x) => x.isWord);
                                  return (
                                    <span
                                      key={t.globalIdx}
                                      data-entry={index}
                                      data-idx={t.globalIdx}
                                      title={role?.title}
                                      className={
                                        'dict-popup__token' +
                                        (role ? ' wasit-role--' + role.role : '') +
                                        (sel?.has(t.globalIdx) ? ' dict-popup__token--selected' : '') +
                                        (matches.get(index)?.has(si) && firstWord ? ' ' + WASIT_MATCH_CLASS : '')
                                      }
                                      onPointerDown={(e) => {
                                        e.preventDefault();
                                        drag.current = { entry: index, idx: t.globalIdx, moved: false };
                                      }}
                                    >
                                      {t.text}
                                    </span>
                                  );
                                })}
                              </div>
                            );
                          })}
                        </div>
                        {subGroups.length > 1 && (
                          <button
                            type="button"
                            className="qr-add-sm"
                            disabled={savedEntries.has(subKey)}
                            onClick={() => addEntries(subKey, [{ ...entry, senses: group.map((si) => entry.senses[si]) }])}
                            aria-label="Add just this part"
                            title={savedEntries.has(subKey) ? 'Added' : 'Add just this part'}
                          >
                            {savedEntries.has(subKey) ? <IconCheck size={14} /> : <IconPlus />}
                          </button>
                        )}
                      </div>
                    );
                  })}
                  {sel && sel.size > 0 && (
                    <button type="button" className="qr-chip-btn qr-dict__save-sel" dir="ltr" onClick={() => saveSelection(index)}>
                      <IconPlus /> Save selection ({sel.size})
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </section>
    );
  }

  return (
    <aside
      className={'qr-margin qr-dict' + (compare ? ' qr-dict--compare' : '')}
      aria-label="Dictionary"
      style={{ zoom: prefs.dictionaryPopupSizePct / 100 }}
    >
      <div className="qr-margin__top">
        <button type="button" className="qr-close" onClick={onClose} aria-label="Close dictionary">
          <IconClose />
        </button>
        <div className="qr-margin__tools">
          {canCompare && (
            <button
              type="button"
              className={'qr-round-btn qr-round-btn--sm' + (compare ? ' qr-round-btn--on' : '')}
              aria-pressed={compare}
              aria-label="Compare dictionaries side by side"
              title="Compare dictionaries"
              onClick={() => updatePrefs({ dictionaryPanelLayout: compare ? 'merged' : 'split' })}
            >
              <IconCompare />
            </button>
          )}
          <button type="button" className="qr-round-btn qr-round-btn--sm" onClick={onEdit} aria-label="Edit card" title="Edit">
            <IconPencil />
          </button>
          <button
            type="button"
            className="qr-round-btn qr-round-btn--sm qr-round-btn--primary"
            onClick={onToggleSave}
            disabled={!result?.entries.length}
            aria-label={saved ? 'Remove from vocabulary' : 'Add to vocabulary'}
            title={saved ? 'In vocabulary · press to remove' : 'Add to vocabulary'}
          >
            {saved ? <IconCheck /> : <IconPlus size={17} />}
          </button>
        </div>
      </div>

      <div className="qr-dict__head" dir="rtl">
        <div className="qr-dict__word" lang="ar">
          {word}
        </div>
        {(root || kind || lemma) && (
          <div className="qr-dict__chips">
            {root && (
              <button
                type="button"
                className="qr-dict__root"
                aria-expanded={rootOpen}
                title="Show other words from this root"
                onClick={() => setRootOpen((open) => !open)}
              >
                <span lang="ar">{spaced(root)}</span>
                <span className="qr-dict__root-label">root</span>
              </button>
            )}
            {kind && <span className="qr-dict__kind">{kind}</span>}
            {lemma && (
              <span className="qr-dict__lemma" lang="ar">
                {lemma}
              </span>
            )}
          </div>
        )}
        <div className="qr-dict__status" dir="ltr">
          {rarity && (
            <span className="qr-dict__rarity">
              {TIER_LABELS[rarity.tier]}
              {rarity.percentile !== null ? ` · top ${Math.max(1, Math.round((1 - rarity.percentile) * 100))}%` : ''}
            </span>
          )}
          <span className={'qr-status qr-status--' + status.kind}>{statusText(status)}</span>
        </div>
      </div>

      <div className="qr-margin__scroll">
        {loading && <p className="qr-dict__empty">Looking up…</p>}
        {!loading && result?.failedProviders?.length ? (
          <p className="qr-dict__empty" role="status">
            Couldn't load: {result.failedProviders.map((p) => p.name).join(', ')}
          </p>
        ) : null}
        {!loading && !entries.length && <p className="qr-dict__empty">No entry found for this word yet.</p>}
        {!loading && entries.length > 0 && (
          <div className="qr-dict__groups">
            {compare ? (
              <>
                <div>{renderGroup(groups[0])}</div>
                <div>{groups.slice(1).map(renderGroup)}</div>
              </>
            ) : (
              groups.map(renderGroup)
            )}
          </div>
        )}

        {rootOpen && prefs.verbFormsEnabled && root && family && family.root === root && family.members.length > 0 && (
          <section className="qr-dict__section">
            <h4 className="qr-dict__section-title qr-dict__section-title--spaced">Other verbs from this root</h4>
            <div className="qr-dict__family" dir="rtl">
              {family.members.map((m, i) => (
                <button
                  key={m.lemma + i}
                  type="button"
                  className={'qr-dict__member' + (lead?.lemma === m.lemma ? ' qr-dict__member--current' : '')}
                  title={m.gloss}
                  onClick={() => onLookUp(m.lemma)}
                >
                  <span lang="ar">{m.lemma}</span>
                  {m.form && <span className="qr-dict__member-form">{m.form}</span>}
                </button>
              ))}
            </div>
          </section>
        )}

        {sentence && (
          <section className="qr-dict__section">
            <h4 className="qr-dict__section-title qr-dict__section-title--spaced">In this book</h4>
            <p className="qr-dict__context" dir="rtl" lang="ar">
              {at === -1 ? (
                sentence
              ) : (
                <>
                  {sentence.slice(0, at)}
                  <strong>{word}</strong>
                  {sentence.slice(at + word.length)}
                </>
              )}
            </p>
            <p className="qr-dict__fine">
              {prefs.sentenceContextEnabled ? 'Saved with the card, so you can review it in context. ' : ''}
              Seen {encounters} {encounters === 1 ? 'time' : 'times'} · looked up {lookups} {lookups === 1 ? 'time' : 'times'}.
            </p>
          </section>
        )}
      </div>

      <div className="qr-margin__foot">
        <button
          type="button"
          className={'qr-btn qr-btn--wide' + (saved && !selectedCount ? '' : ' qr-btn--primary')}
          onClick={primary}
          disabled={!saved && !result?.entries.length}
        >
          {selectedCount > 0 ? `Save selection (${selectedCount})` : saved ? 'In vocabulary · Edit card' : 'Add to vocabulary'}
        </button>
        {prefs.quickAddShortcutEnabled && <span className="qr-margin__hint">Ctrl Shift A</span>}
      </div>
    </aside>
  );
}
