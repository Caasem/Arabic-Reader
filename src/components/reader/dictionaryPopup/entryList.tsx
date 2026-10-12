import type { Dispatch, MutableRefObject, PointerEvent, ReactNode, SetStateAction } from 'react';
import type { DictionaryEntry } from '../../../types';
import { normalize } from '../../../reader/tokenizer/arabicTokenizer';
import { SUB_ENTRY_MATCH_ATTR, WASIT_MATCH_CLASS } from '../../../wasitMatch';
import type { annotateEntry } from '../../../wasitStructure';
import { VerbFormInfo, VerbFormMark } from '../../../verbForms';
import { groupLabel } from '../../../popupClean';
import { vowelScore } from '../../../dictionary/providers/personal/vowels';
import { reconstructSelection, senseBody, type DefinitionToken, type ExampleEntryTokens } from '../definitionTokens';
import type { EntryGroup } from './entryGroups';
import { findVerses, type Verse } from '../../../dictionary/senseFormat/sihahVerses';
import { verseNodes } from '../../../dictionary/senseFormat/VerseTokens';
import { HansWehrMeaning } from '../../../dictionary/senseFormat/HansWehrMeaning';
import { SenseText, type WordPicking } from '../../../dictionary/senseFormat/SenseText';
import { entryLanguage, foldsBehindRoot, traitsOf } from '../../../dictionary/providerTraits';
import { canSelectWords, FOLD_ABOVE, visibleEntryIndexes } from '../../../dictionary/entryFeatures';
import { MorphValue } from './MorphValue';

/** Entries whose senses carry a lead note, a tag in front and worked examples (Baranov, a file the reader loaded). */
export const hasRichSenses = (providerId: string): boolean => !!traitsOf(providerId).richSenses;
/** Examples shown before the "N more examples" button. */
const EXAMPLES_SHOWN = 3;

/** Everything the entry list reads from the popup: its state, its settings and its callbacks.
 * The popup builds this on every render and the list functions below only read it. */
export interface EntryListContext {
  word: string;
  clean: boolean;
  prefs: { morphDisplayStyle: string; verbFormsEnabled: boolean; wasitStructureExamples: string; sihahVerseLayout: boolean };
  wasitStructure: Map<number, ReturnType<typeof annotateEntry>>;
  wasitMatches: Map<number, Set<number>>;
  /** An entry's text as word tokens, cut the first time it is asked for (only entries on show are). */
  tokensFor: (entryIdx: number) => ExampleEntryTokens | undefined;
  tokenSelections: Map<number, Set<number>>;
  startFolded: boolean;
  startFoldedExamples: boolean;
  foldedEntries: Set<number>;
  setFoldedEntries: Dispatch<SetStateAction<Set<number>>>;
  /** Entries about the tapped word (see entriesAboutWord): what a long list folds down to. */
  aboutEntries: ReadonlySet<number>;
  /** Dictionaries whose whole list the reader opened with "Show all". */
  expandedGroups: Set<string>;
  setExpandedGroups: Dispatch<SetStateAction<Set<string>>>;
  /** Root-filed dictionaries opened from their folded root row (see foldsBehindRoot). */
  openedRoots: Set<string>;
  /** One dictionary per tab: a tab has the popup to itself, so it shows every entry (no root row, no folding). */
  tabbed?: boolean;
  setOpenedRoots: Dispatch<SetStateAction<Set<string>>>;
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
/** A sense's word tokens drawn one by one, or with its Al-Sihah verses set apart. */
function drawTokens(tokens: DefinitionToken[], verses: Verse[] | null, draw: (t: DefinitionToken) => ReactNode): ReactNode[] {
  return verses?.length ? verseNodes(tokens, verses, draw) : tokens.map(draw);
}

export function renderGroupList(ctx: EntryListContext, groups: EntryGroup[]) {
  const {
    word, clean, prefs, wasitStructure, wasitMatches, tokensFor, tokenSelections, startFolded, startFoldedExamples,
    aboutEntries, expandedGroups, setExpandedGroups, openedRoots, setOpenedRoots, foldedEntries, setFoldedEntries, savedGroups, setSavedGroups, savedEntryKeys, setSavedEntryKeys, entryItemIds,
    openForms, setOpenForms, expandedExamples, setExpandedExamples, onSaveEntry, onUnsaveEntry, onSaveEntries, onSaveSelection,
    clearEntrySelection, handleTokenPointerDown, handleTokensPointerMove, tabbed,
  } = ctx;
  return groups.map((group) => {
    // A long list shows the entries about the tapped word (else the first) until the reader opens it all.
    const foldable = !tabbed && group.entries.length > FOLD_ABOVE;
    const opened = expandedGroups.has(group.providerId);
    const shown = foldable && !opened ? new Set(visibleEntryIndexes(group.entries.map((e) => e.index), aboutEntries)) : null;
    const shownEntries = shown ? group.entries.filter((e) => shown.has(e.index)) : group.entries;
    // A root-filed dictionary starts as one row naming its root(s); opening it shows the entries about the word.
    if (!tabbed && foldsBehindRoot(group.providerId) && !openedRoots.has(group.providerId)) {
      const roots = [...new Set(group.entries.map((e) => e.entry.root || e.entry.headword).filter(Boolean))];
      const count = group.entries.length;
      return (
        <div className="dict-popup__group" key={group.providerId}>
          <div className="dict-popup__group-header">{clean ? groupLabel(group) : group.providerName}</div>
          <button
            type="button"
            className="dict-popup__root-row"
            aria-expanded={false}
            onClick={() => setOpenedRoots((prev) => new Set(prev).add(group.providerId))}
            title="Show this dictionary's entries"
          >
            <bdi dir="rtl" lang="ar" className="dict-popup__root-row-root">
              {roots.join(' · ')}
            </bdi>
            <span className="dict-popup__root-row-count">
              <bdi dir="ltr">{count === 1 ? '1 entry' : `${count} entries`}</bdi> <span aria-hidden="true">›</span>
            </span>
          </button>
        </div>
      );
    }
    return (
    <div className="dict-popup__group" key={group.providerId}>
      <div className="dict-popup__group-header">
        {clean ? groupLabel(group) : group.providerName}
        {clean && onSaveEntries && group.entries.length > 1 && (
          <button
            className="dict-popup__sense-add dict-popup__group-add"
            disabled={savedGroups.has(group.providerId)}
            onClick={() => {
              onSaveEntries(shownEntries.map((e) => e.entry));
              setSavedGroups((prev) => new Set(prev).add(group.providerId));
            }}
            aria-label="Add this whole section to vocabulary"
            title={savedGroups.has(group.providerId) ? 'Added' : 'Add this whole section'}
          >
            {savedGroups.has(group.providerId) ? '✓' : '+'}
          </button>
        )}
      </div>
      {shownEntries.map(({ entry, index: i }) => {
        const gk = group.entries.findIndex((e) => e.index === i);
        // Non-contiguous word selection (click to toggle, drag to add a range) works in every entry that has text.
        // The line before this one in the same article: Al-Ṣiḥāḥ's verses follow a line that introduces them.
        const before = gk > 0 ? group.entries[gk - 1].entry : undefined;
        const prevGloss = before && before.articleKey !== undefined && before.articleKey === entry.articleKey ? before.senses[before.senses.length - 1]?.gloss : undefined;
        const rich = hasRichSenses(entry.providerId);
        const isAr = entryLanguage(entry) === 'ar';
        const selectable = canSelectWords(entry);
        const sel = selectable ? tokenSelections.get(i) : undefined;
        const hasSelection = !!sel && sel.size > 0;
        // The entry about the looked-up word (see wasitMatch) starts open whatever the rest do; it is coloured only while highlighting is on.
        const aboutThis = aboutEntries.has(i);
        const highlighted = (wasitMatches.get(i)?.size ?? 0) > 0;
        // An Arabic entry cut from a root article (Al-Ṣiḥāḥ, Al-Wasīṭ) reads as running text, as the article did:
        // no heading row, its opening word set in the text, its "+" faint until the entry is hovered.
        const inline = isAr && entry.articleKey !== undefined;
        const groupRoot = group.entries[0]?.entry.root;
        // Clean layout: Arabic entries and Baranov-style ones fold to their headword row when there are many; tapping the headword flips that.
        const foldsToHead = clean && (isAr || rich) && !inline;
        const startsFolded = (isAr ? startFolded : startFoldedExamples) && !aboutThis;
        const folded = foldsToHead && startsFolded !== foldedEntries.has(i);
        const tokens = selectable && !folded ? tokensFor(i) : undefined;
        // The entry whose spelling (and vowels, when the tapped word has them) is the one looked up.
        const exactMatch = rich && group.entries.length > 1 && normalize(entry.headword) === normalize(word) && vowelScore(word, entry.headword) < 2;

        function toggleFold() {
          clearEntrySelection(i);
          setFoldedEntries((prev) => {
            const next = new Set(prev);
            if (!next.delete(i)) next.add(i);
            return next;
          });
        }

        function saveThisSelection() {
          const picked = tokensFor(i);
          if (!picked || !sel || !onSaveSelection) return;
          onSaveSelection(entry, reconstructSelection(picked.flat, sel));
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
              (inline ? ' dict-popup__entry--inline' : clean && isAr ? ' dict-popup__entry--subs' : '') +
              (exactMatch ? ' dict-popup__entry--best' : '') +
              // The entry about the tapped word keeps its highlight for as long as the popup is open.
              (highlighted ? ' dict-popup__entry--about' : '') +
              (entry.vowelClash ? ' dict-popup__entry--clash' : '')
            }
            data-entry-index={i}
            key={entry.providerId + i}
            onClick={
              clean && entry.verbForm
                ? (e) => {
                    // Tapping the verb (not its root/form chips or buttons) opens its other forms.
                    if ((e.target as HTMLElement).closest('.dict-popup__morph-item, .dict-popup__token, button')) return;
                    setOpenForms((prev) => {
                      const next = new Set(prev);
                      if (!next.delete(i)) next.add(i);
                      return next;
                    });
                  }
                : undefined
            }
          >
            {(clean || inline) && saveButton}
            {inline ? (
              entry.root && entry.root !== groupRoot && (
                <span className="dict-popup__entry-morph dict-popup__entry-morph--inline">
                  <MorphValue kind="root" value={entry.root} />
                </span>
              )
            ) : (
            <div className="dict-popup__entry-head">
              {foldsToHead ? (
                <span
                  className={'dict-popup__headword dict-popup__headword--toggle' + (highlighted ? ' ' + WASIT_MATCH_CLASS : '')}
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
                <span className={'dict-popup__headword' + (highlighted ? ' ' + WASIT_MATCH_CLASS : '')}>{entry.headword}</span>
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
            )}
            {!clean && <VerbFormInfo entry={entry} />}
            {isAr ? folded ? null : (
              <div
                className={'dict-popup__tokens' + (wasitStructure.get(i) && prefs.wasitStructureExamples === 'dim' ? ' wasit-examples--dim' : '')}
                dir="rtl"
                onPointerMove={handleTokensPointerMove}
              >
                {entry.senses.map((s, si) => {
                  const structure = wasitStructure.get(i)?.[si];
                  let wordNo = 0;
                  const sihahVerses = traitsOf(entry.providerId).verses && prefs.sihahVerseLayout ? findVerses(senseBody(entry, si), si > 0 ? entry.senses[si - 1]?.gloss : prevGloss) : null;
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
                    {drawTokens(tokens ? tokens.senses[si].gloss : [], sihahVerses, (t) => {
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
                            (inline && si === 0 && t === tokens?.senses[0].gloss.find((x) => x.isWord) ? ' dict-popup__lead-word' : '') +
                            (wasitMatches.get(i)?.has(si) && t === tokens?.senses[si].gloss.find((x) => x.isWord) ? ' ' + WASIT_MATCH_CLASS : '')
                          }
                          onPointerDown={(e) => handleTokenPointerDown(i, t.globalIdx, e)}
                        >
                          {word?.display ?? t.text}
                        </span>
                      );
                    })}
                    {(s.pos || s.gender) && <span className="dict-popup__tag">{[s.pos, s.gender].filter(Boolean).join(' · ')}</span>}
                  </div>
                  );
                })}
              </div>
            ) : folded ? null : (
              <ul
                className={'dict-popup__senses' + (tokens ? ' dict-popup__senses--words' : '')}
                onPointerMove={tokens ? handleTokensPointerMove : undefined}
              >
                {entry.senses.map((s, si) => {
                  const st = tokens?.senses[si];
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
                  // The line about the looked-up word is marked for the scroll to land on (see wasitMatch).
                  const matched = wasitMatches.get(i)?.has(si);
                  // These dictionaries read left to right, with their Arabic words set apart (see SenseText).
                  const traits = traitsOf(entry.providerId);
                  // An entry cut from an article has its headword in the head row; its first sense is drawn without it.
                  const from = si === 0 ? (entry.headLength ?? 0) : 0;
                  const picking: WordPicking | undefined = st ? { tokens: st.gloss, entryIdx: i, selected: sel, onPointerDown: handleTokenPointerDown } : undefined;
                  return (
                    <li
                      key={si}
                      className="dict-popup__sense--en"
                      dir={traits.autoDirection ? 'auto' : 'ltr'}
                      {...(matched ? { [SUB_ENTRY_MATCH_ATTR]: '' } : {})}
                    >
                      {traits.richSenses ? (
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
                        <span className="dict-popup__sense-text">
                          {traits.senseStyle === 'hanswehr' && from === 0 ? (
                            <HansWehrMeaning gloss={s.gloss} picking={picking} />
                          ) : (
                            <SenseText text={s.gloss} style={traits.senseStyle} spans={s.italics} from={from} lead={from === 0} picking={picking} />
                          )}
                          {(s.pos || s.gender) && <span className="dict-popup__tag">{[s.pos, s.gender].filter(Boolean).join(' · ')}</span>}
                        </span>
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
      {foldable && (
        <button
          type="button"
          className={'dict-popup__show-all' + (opened ? ' dict-popup__show-all--open' : '')}
          aria-expanded={opened}
          aria-label={opened ? 'Hide the other entries' : `Show all ${group.entries.length} entries`}
          title={opened ? 'Hide the other entries' : `Show all ${group.entries.length} entries`}
          onClick={() =>
            setExpandedGroups((prev) => {
              const next = new Set(prev);
              if (!next.delete(group.providerId)) next.add(group.providerId);
              return next;
            })
          }
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            style={{ display: 'block', transform: opened ? 'rotate(180deg)' : undefined }}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      )}
    </div>
    );
  });
}
