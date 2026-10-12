import { patchItems } from '../studyDesk/deskStore';
import type { DeskItem } from '../studyDesk/types';
import { answerPatch, reopenPatch } from './masail';
import { openBookById, type OpenBook } from './nav';
import { say } from './say';
import { readingBook, setThinking } from './state';

/** Find the answer: hunt for it in the book it was asked in (or the open one). Hunting is set first, so the bar is there when the book opens. */
export async function findAnswer(q: DeskItem, onOpenBook?: OpenBook): Promise<void> {
  setThinking({ hunting: q.id, screen: null, selected: null, touch: null });
  const opened = q.source?.bookId ? await openBookById(q.source.bookId, onOpenBook) : false;
  if (!opened && !readingBook()) say('Open a book to look for the answer');
}

/** A passage answers the masʾala: saved with its citation (the passage keeps its source), with Undo. */
export async function answerWith(q: DeskItem, passage: DeskItem): Promise<void> {
  const before = { answer: q.answer, answeredAt: q.answeredAt };
  await patchItems([{ id: q.id, patch: answerPatch(passage.id) }]);
  setThinking({ hunting: null, selected: null });
  say('Masʾala answered and saved with its citation', () => patchItems([{ id: q.id, patch: before }]));
}

export async function reopenQuestion(q: DeskItem): Promise<void> {
  const before = { answer: q.answer, answeredAt: q.answeredAt };
  await patchItems([{ id: q.id, patch: reopenPatch() }]);
  say('Reopened', () => patchItems([{ id: q.id, patch: before }]));
}
