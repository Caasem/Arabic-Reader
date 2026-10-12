import type { Dispatch, MutableRefObject, PointerEvent, ReactNode, SetStateAction } from 'react';
import type { DictionaryEntry } from '../../../types';
import { normalize } from '../../../reader/tokenizer/arabicTokenizer';
import { isTokenizedProvider } from '../../../dictionary/tokenizedProviders';
import { matchedHead, SUB_ENTRY_MATCH_ATTR, WASIT_MATCH_CLASS } from '../../../wasitMatch';
import type { annotateEntry } from '../../../wasitStructure';
import { VerbFormInfo, VerbFormMark } from '../../../verbForms';
import { groupLabel } from '../../../popupClean';
import { vowelScore } from '../../../dictionary/providers/personal/vowels';
import { reconstructSelection, type DefinitionToken, type ExampleEntryTokens } from '../definitionTokens';
import type { EntryGroup } from './entryGroups';
import { LaneMeaning } from '../../../dictionary/senseFormat/LaneMeaning';
import { MorphValue } from './MorphValue';

/** Dictionaries whose senses carry examples: the verb-form tag leads the entry, its words can be
 * selected and saved on their own, and long ones fold (Baranov, and a file the reader loaded). */
export const EXAMPLE_PROVIDERS = new Set(['baranov', 'personal']);
/** Examples shown before the "N more examples" button. */
const EXAMPLES_SHOWN = 3;

/** Everything the entry list reads from the popup: its state, its settings and its callbacks.
 * The popup builds this on every render and the list functions below only read it. */
export interface EntryListContext {
  word: string;
  clean: boolean;
  prefs: { morphDisplayStyle: string; verbFormsEnabled: boolean; wasitStructureExamples: string };
  wasitStructure: Map<number, ReturnType<typeof annotateEntry>>;
  wasitMatches: Map<number, Set<number>>;
  entryTokenData: Map<number, { flat: DefinitionToken[]; bySense: DefinitionToken[][] }>;
  exampleTokenData: Map<number, ExampleEntryTokens>;
  tokenSelections: Map<number, Set<number>>;
  startFolded: boolean;
  startFoldedExamples: boolean;
  foldedEntries: Set<number>;
  setFoldedEntries: Dispatch<SetStateAction<Set<number>>>;
  savedSubKeys: Set<string>;
  setSavedSubKeys: Dispatch<SetStateAction<Set<string>>>;
  savedGroups: Set<string>;
  setSavedGroups: Dispatch<SetStateAction<Set<string>>>;
  savedEntryKeys: Set<number>;
  setSavedEntryKeys: Dispatch<SetStateAction<Set<number>>>;
  entryItemIds: MutableRefObject<Map<number, string>>;
  openForms: Set<number>;
  setOpenForms: Dispatch<SetStateAction<Set<number>>>;
  expandedExamples: Set<number>;
  setExpandedExamples: Dispatch<SetStateAction<Set<number>>>;
  onSaveEntry?: (entry: DictionaryEntry) => void | Promise<string | null | void>;
  onUnsaveEntry?: (itemId: string) => void | Promise<void>;
  onSaveEntries?: (entries: DictionaryEntry[]) => void;
  onSaveSelection?: (entry: DictionaryEntry, selectedText: string) => void;
  clearEntrySelection: (entryIdx: number) => void;
  handleTokenPointerDown: (entryIdx: number, idx: number, e: PointerEvent) => void;
  handleTokensPointerMove: (e: PointerEvent) => void;
}
/** Al-Wasit's senses. Clean layout groups each lead sense with its continuations into a
 * sub-entry with its own round "+", which saves just that section. */
export function renderSubEntries(ctx: EntryListContext, entry: DictionaryEntry, entryIndex: number, renderSense: (s: DictionaryEntry['senses'][number], si: number) => ReactNode) {
  const { clean, wasitStructure, savedSubKeys, setSavedSubKeys, onSaveEntry } = ctx;
  // Only Al-Wasit has lead/continuation structure to group by; the other
  // root-keyed dictionaries' lines would each get their own "+".
  if (!clean || entry.providerId !== 'alwasit') return entry.senses.map(renderSense);
  const groups: number[][] = [];
  entry.senses.forEach((_, si) => {
    const structure = wasitStructure.get(entryIndex)?.[si];
    if (!groups.length || structure?.isLead || !structure?.isContinuation) groups.push([si]);
    else groups[groups.length - 1].push(si);
  });
  return groups.map((group, gi) => {
    const key = `${entryIndex}:${gi}`;
    const done = savedSubKeys.has(key);
    return (
      <div className="dict-popup__subentry" key={gi}>
        {onSaveEntry && groups.length > 1 && (
          <button
            className="dict-popup__sense-add"
            disabled={done}
            onClick={() => {
              onSaveEntry({ ...entry, senses: group.map((si) => entry.senses[si]) });
              setSavedSubKeys((prev) => new Set(prev).add(key));
            }}
            aria-label="Add just this section to vocabulary"
            title={done ? 'Added' : 'Add just this section'}
          >
            {done ? '✓' : '+'}
          </button>
        )}
        <div className="dict-popup__sense-body">{group.map((si) => renderSense(entry.senses[si], si))}</div>
      </div>
    );
  });
}

export function renderGroupList(ctx: EntryListContext, groups: EntryGroup[]) {
  const {
    word, clean, prefs, wasitStructure, wasitMatches, entryTokenData, exampleTokenData, tokenSelections, startFolded, startFoldedExamples,
    foldedEntries, setFoldedEntries, savedGroups, setSavedGroups, savedEntryKeys, setSavedEntryKeys, entryItemIds,
    openForms, setOpenForms, expandedExamples, setExpandedExamples, onSaveEntry, onUnsaveEntry, onSaveEntries, onSaveSelection,
    clearEntrySelection, handleTokenPointerDown, handleTokensPointerMove,
  } = ctx;
  return groups.map((group) => (
    <div className="dict-popup__group" key={group.providerId}>
      <div className="dict-popup__group-header">
        {clean ? groupLabel(group) : group.providerName}
        {clean && onSaveEntries && (isTokenizedProvider(group.providerId) || EXAMPLE_PROVIDERS.has(group.providerId)) && group.entries.length > 1 && (
          <button
            className="dict-popup__sense-add dict-popup__group-add"
            disabled={savedGroups.has(group.providerId)}
            onClick={() => {
              onSaveEntries(group.entries.map((e) => e.entry));
              setSavedGroups((prev) => new Set(prev).add(group.providerId));
            }}
            aria-label="Add this whole section to vocabulary"
            title={savedGroups.has(group.providerId) ? 'Added' : 'Add this whole section'}
          >
            {savedGroups.has(group.providerId) ? '✓' : '+'}
          </button>
        )}
      </div>
      {group.entries.map(({ entry, index: i }) => {
        // Non-contiguous word selection (click to toggle, drag to add a
        // range) -- the root-keyed Arabic-Arabic dictionaries only (see
        // isTokenizedProvider), and only while a save-selection callback
        // actually exists to hand it to. Every other provider's entries
        // keep the plain, non-interactive sense list below.
        const tokenData = isTokenizedProvider(entry.providerId) ? entryTokenData.get(i) : undefined;
        const exTokens = EXAMPLE_PROVIDERS.has(entry.providerId) ? exampleTokenData.get(i) : undefined;
        const wordData = tokenData ?? exTokens;
        const sel = wordData ? tokenSelections.get(i) : undefined;
        const hasSelection = !!sel && sel.size > 0;
        const folded = clean && ((!!tokenData && startFolded !== foldedEntries.has(i)) || (!!exTokens && startFoldedExamples !== foldedEntries.has(i)));
        // The entry whose spelling (and vowels, when the tapped word has them) is the one looked up.
        const exactMatch = !!exTokens && group.entries.length > 1 && normalize(entry.headword) === normalize(word) && vowelScore(word, entry.headword) < 2;

        function toggleFold() {
          clearEntrySelection(i);
          setFoldedEntries((prev) => {
            const next = new Set(prev);
            if (!next.delete(i)) next.add(i);
            return next;
          });
        }

        function saveThisSelection() {
          if (!wordData || !sel || !onSaveSelection) return;
          onSaveSelection(entry, reconstructSelection(wordData.flat, sel));
          clearEntrySelection(i);
        }

        // Shown for a single entry too, so saving one entry (and recording it as the reader's pick) always works the same way.
        const saveButton =
          onSaveEntry ? (
            <button
              className={'dict-popup__entry-save' + (hasSelection ? ' dict-popup__entry-save--selection' : '')}
              onClick={() => {
                if (hasSelection) {
                  saveThisSelection();
                  return;
                }
                if (savedEntryKeys.has(i)) {
                  const itemId = entryItemIds.current.get(i);
                  if (!itemId || !onUnsaveEntry) return;
                  entryItemIds.current.delete(i);
                  setSavedEntryKeys((prev) => {
                    const next = new Set(prev);
                    next.delete(i);
                    return next;
                  });
                  void onUnsaveEntry(itemId);
                  return;
                }
                setSavedEntryKeys((prev) => new Set(prev).add(i));
                void Promise.resolve(onSaveEntry(entry)).then((itemId) => {
                  if (itemId) entryItemIds.current.set(i, itemId);
                });
              }}
              disabled={!hasSelection && savedEntryKeys.has(i) && !onUnsaveEntry}
              aria-label={hasSelection ? `Save just the ${sel!.size} selected words for "${entry.headword}"` : `Add just "${entry.headword}" to vocabulary`}
              title={hasSelection ? 'Will save only the selected words, not the full definition' : savedEntryKeys.has(i) && onUnsaveEntry ? 'Remove this definition' : 'Add just this definition'}
            >
              {hasSelection ? '✓ sel' : savedEntryKeys.has(i) ? '✓' : '+'}
            </button>
          ) : null;

        return (
          <div
            className={
              'dict-popup__entry' +
              (clean && entry.verbForm ? ' dict-popup__entry--tappable' : '') +
              (clean && tokenData ? ' dict-popup__entry--subs' : '') +
              (exactMatch ? ' dict-popup__entry--best' : '') +
              (entry.vowelClash ? ' dict-popup__entry--clash' : '')
            }
            data-entry-index={i}
            key={entry.providerId + i}
            onClick={
              clean && entry.verbForm
                ? (e) => {
                    // Tapping the verb (not its root/form chips or buttons) opens its other forms.
                    if ((e.target as HTMLElement).closest('.dict-popup__morph-item, button')) return;
                    setOpenForms((prev) => {
                      const next = new Set(prev);
                      if (!next.delete(i)) next.add(i);
                      return next;
                    });
                  }
                : undefined
            }
          >
            {clean && saveButton}
            <div className="dict-popup__entry-head">
              {clean && wordData ? (
                <span
                  className="dict-popup__headword dict-popup__headword--toggle"
                  role="button"
                  tabIndex={0}
                  aria-expanded={!folded}
                  title={folded ? 'Show the definition' : 'Hide the definition'}
                  onClick={toggleFold}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      toggleFold();
                    }
                  }}
                >
                  {entry.headword}
                </span>
              ) : (
                <span className="dict-popup__headword">{entry.headword}</span>
              )}
              {/* Sits between the headword and the per-entry save
                  button -- root before form (read first, right next to
                  the headword it belongs to), both smaller than the
                  headword since they're a secondary identifier, not
                  the entry's main content. Different entries in the
                  same provider's group can genuinely come from
                  different roots/lemmas (e.g. an unvocalized verb form
                  ambiguous between Form I and Form IV), so this stays
                  per-entry rather than folded into the group header.
                  Only shown when it says something the headword
                  doesn't already -- a plain root-keyed entry (e.g.
                  Al-Wasit) would otherwise repeat its own headword
                  right back as "root". */}
              {((entry.lemma && entry.lemma !== entry.headword) || (entry.root && entry.root !== entry.headword)) && (
                <span
                  className={
                    'dict-popup__entry-morph' + (prefs.morphDisplayStyle === 'badges' ? ' dict-popup__entry-morph--badges' : '')
                  }
                >
                  {/* Clean layout: dictionary form first, then the root; pressing a verb's root shows its form. */}
                  {clean && entry.lemma && entry.lemma !== entry.headword && <MorphValue kind="form" value={entry.lemma} />}
                  {entry.root && entry.root !== entry.headword && (
                    <MorphValue
                      kind="root"
                      value={entry.root}
                      label={clean && prefs.verbFormsEnabled && entry.verbForm ? `Form ${entry.verbForm}` : undefined}
                    />
                  )}
                  {!clean && entry.lemma && entry.lemma !== entry.headword && <MorphValue kind="form" value={entry.lemma} />}
                </span>
              )}
              {!clean && <VerbFormMark entry={entry} />}
              {!clean && saveButton}
            </div>
            {entry.vowelClash && <div className="dict-popup__clash-note">doesn't match the vowels in the text</div>}
            {!clean && <VerbFormInfo entry={entry} />}
            {tokenData ? folded ? null : (
              <div
                className={'dict-popup__tokens' + (wasitStructure.get(i) && prefs.wasitStructureExamples === 'dim' ? ' wasit-examples--dim' : '')}
                dir="rtl"
                onPointerMove={handleTokensPointerMove}
              >
                {renderSubEntries(ctx, entry, i, (s, si) => {
                  const structure = wasitStructure.get(i)?.[si];
                  let wordNo = 0;
                  return (
                  <div
                    className={
                      'dict-popup__token-sense' +
                      (structure?.isLead ? ' wasit-sense--lead' : '') +
                      (structure?.isContinuation ? ' wasit-sense--cont' : '')
                    }
                    key={si}
                    {...(wasitMatches.get(i)?.has(si) ? { [SUB_ENTRY_MATCH_ATTR]: '' } : {})}
                  >
                    {tokenData.bySense[si].map((t) => {
                      if (!t.isWord) return <span key={t.globalIdx}>{t.text}</span>;
                      const word = structure?.words[wordNo++];
                      return (
                        <span
                          key={t.globalIdx}
                          data-entry={i}
                          data-idx={t.globalIdx}
                          title={word?.title}
                          className={
                            'dict-popup__token' +
                            (word ? ' wasit-role--' + word.role : '') +
                            (sel?.has(t.globalIdx) ? ' dict-popup__token--selected' : '') +
                            (wasitMatches.get(i)?.has(si) && t === tokenData.bySense[si].find((x) => x.isWord) ? ' ' + WASIT_MATCH_CLASS : '')
                          }
                          onPointerDown={(e) => handleTokenPointerDown(i, t.globalIdx, e)}
                        >
                          {t.text}
                        </span>
                      );
                    })}
                    {(s.pos || s.gender) && <span className="dict-popup__tag">{[s.pos, s.gender].filter(Boolean).join(' · ')}</span>}
                  </div>
                  );
                })}
              </div>
            ) : exTokens && folded ? null : (
              <ul
                className={'dict-popup__senses' + (exTokens ? ' dict-popup__senses--words' : '')}
                onPointerMove={exTokens ? handleTokensPointerMove : undefined}
              >
                {entry.senses.map((s, si) => {
                  const st = exTokens?.senses[si];
                  const shown = !s.examples ? 0 : expandedExamples.has(i) ? s.examples.length : EXAMPLES_SHOWN;
                  const renderWords = (tokens: DefinitionToken[]) =>
                    tokens.map((t) =>
                      t.isWord ? (
                        <span
                          key={t.globalIdx}
                          data-entry={i}
                          data-idx={t.globalIdx}
                          className={'dict-popup__token' + (sel?.has(t.globalIdx) ? ' dict-popup__token--selected' : '')}
                          onPointerDown={(e) => handleTokenPointerDown(i, t.globalIdx, e)}
                        >
                          {t.text}
                        </span>
                      ) : (
                        <span key={t.globalIdx}>{t.text}</span>
                      ),
                    );
                  // Lane and Hans Wehr: the line about the looked-up word gets its headword coloured (see wasitMatch).
                  const matched = wasitMatches.get(i)?.has(si);
                  const head = matched ? matchedHead(entry.providerId, s.gloss, entry.root ?? entry.headword) : null;
                  return (
                    <li key={si} {...(matched ? { [SUB_ENTRY_MATCH_ATTR]: '' } : {})}>
                      {EXAMPLE_PROVIDERS.has(entry.providerId) ? (
                        <div className="dict-popup__sense-main">
                          {s.notes && <bdi className="dict-popup__lead" dir="rtl">{s.notes}</bdi>}
                          {(s.pos || s.gender) && (
                            <span className="dict-popup__tag dict-popup__tag--lead">{[s.pos, s.gender].filter(Boolean).join(' · ')}</span>
                          )}
                          {st ? renderWords(st.gloss) : s.gloss}
                          {s.examples && (
                            <ul className="dict-popup__examples">
                              {s.examples.slice(0, shown).map((ex, ei) => (
                                <li key={ei}>
                                  <bdi lang="ar" dir="rtl" className="dict-popup__example-ar">{st ? renderWords(st.examples[ei].ar) : ex.ar}</bdi>
                                  <span className="dict-popup__example-gloss">{st ? renderWords(st.examples[ei].gloss) : ex.gloss}</span>
                                </li>
                              ))}
                              {s.examples.length > shown && (
                                <li className="dict-popup__examples-more">
                                  <button
                                    type="button"
                                    onClick={() => setExpandedExamples((prev) => new Set(prev).add(i))}
                                  >
                                    {s.examples.length - shown} more example{s.examples.length - shown === 1 ? '' : 's'}
                                  </button>
                                </li>
                              )}
                            </ul>
                          )}
                        </div>
                      ) : (
                        <>
                          {head ? (
                            <>
                              <span className={WASIT_MATCH_CLASS}>{head[0]}</span>
                              <LaneMeaning text={s.gloss} spans={s.italics} from={head[0].length} />
                            </>
                          ) : (
                            <LaneMeaning text={s.gloss} spans={s.italics} />
                          )}
                          {(s.pos || s.gender) && <span className="dict-popup__tag">{[s.pos, s.gender].filter(Boolean).join(' · ')}</span>}
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {clean && <VerbFormInfo entry={entry} clean open={openForms.has(i)} />}
            {hasSelection && (
              <button className="dict-popup__save-selection" onClick={saveThisSelection}>
                + Save selection ({sel!.size})
              </button>
            )}
          </div>
        );
      })}
    </div>
  ));
}
