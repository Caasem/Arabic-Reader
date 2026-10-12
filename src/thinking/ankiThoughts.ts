import { addNotes, createModel, ensureDeck, findNotes, getDeckNames, getModelNames, notesInfo, type AnkiNote } from '../anki/ankiConnect';
import { CSS, escapeHtml } from '../anki/noteType';
import type { DeskItem } from '../studyDesk/types';
import { citeOf, isThought, thoughtText } from './passages';

/**
 * Scheduled thoughts as Anki notes (docs/features/thinking-front.md, Revisit): the passage and where it is from on
 * the front, the thought on the back. Its own note type, so the vocabulary cards and their sync are untouched.
 */

export const THOUGHT_MODEL = 'Arabic Reader Thought';
export const THOUGHT_FIELDS = ['Passage', 'Source', 'Thought', 'ReaderId'] as const;

const THOUGHT_CSS = `${CSS}
.passage { font-size: 1.7em; line-height: 1.9; }
.thought { text-align: start; line-height: 1.6; margin-top: .6em; }`;

const THOUGHT_CARD = {
  Name: 'Do you still hold it?',
  Front: '<div class="ar passage">{{Passage}}</div>\n{{#Source}}<div class="meta">{{Source}}</div>{{/Source}}',
  Back: '{{FrontSide}}\n<hr id="answer">\n<div class="thought">{{Thought}}</div>',
};

/** Anki fields are HTML: escaped, with line breaks kept. */
const html = (text: string | undefined): string => escapeHtml(text ?? '').replace(/\n/g, '<br>');

/**
 * One thought as an Anki note. The first field cannot be empty, so a thought with no passage puts its place (or
 * failing that, a plain line) there.
 */
export function thoughtNote(thought: DeskItem, passage: DeskItem | undefined, deck: string): AnkiNote {
  const source = citeOf(passage ?? thought);
  const words = (passage?.text ?? '').trim();
  return {
    deckName: deck,
    modelName: THOUGHT_MODEL,
    fields: {
      Passage: html(words || source || 'A thought of yours'),
      Source: html(words ? source : ''),
      Thought: html(thoughtText(thought)),
      ReaderId: thought.id,
    },
    tags: ['arabic-reader', 'thought'],
    // Several thoughts can be on one passage, so Anki's own duplicate check (on the first field) is not used.
    options: { allowDuplicate: true, duplicateScope: 'deck' },
  };
}

export async function ensureThoughtModel(): Promise<void> {
  if ((await getModelNames()).includes(THOUGHT_MODEL)) return;
  await createModel({ modelName: THOUGHT_MODEL, inOrderFields: THOUGHT_FIELDS, css: THOUGHT_CSS, cardTemplates: [THOUGHT_CARD] });
}

/** The thoughts Anki already has, by the ReaderId on their notes. */
async function alreadyThere(): Promise<Set<string>> {
  const ids = await findNotes(`"note:${THOUGHT_MODEL}"`);
  const have = new Set<string>();
  for (let at = 0; at < ids.length; at += 200) {
    for (const info of await notesInfo(ids.slice(at, at + 200))) {
      const readerId = 'fields' in info ? info.fields.ReaderId?.value : undefined;
      if (readerId) have.add(readerId);
    }
  }
  return have;
}

export interface SentThoughts {
  /** New notes in Anki. */
  sent: number;
  /** Already in Anki. */
  had: number;
  failed: number;
}

/**
 * Add the scheduled thoughts Anki does not have yet. `passages` maps a thought's id to the passage it is on, when
 * there is one. Throws AnkiConnectError when Anki cannot be reached.
 */
export async function sendThoughts(items: DeskItem[], passages: Map<string, DeskItem | undefined>, deck: string): Promise<SentThoughts> {
  const wanted = items.filter((i) => i.review && isThought(i));
  if (!wanted.length) return { sent: 0, had: 0, failed: 0 };
  if (!(await getDeckNames()).includes(deck)) await ensureDeck(deck);
  await ensureThoughtModel();
  const have = await alreadyThere();
  const fresh = wanted.filter((i) => !have.has(i.id));
  const ids = fresh.length ? await addNotes(fresh.map((i) => thoughtNote(i, passages.get(i.id), deck))) : [];
  const failed = ids.filter((id) => id == null).length;
  return { sent: ids.length - failed, had: wanted.length - fresh.length, failed };
}
