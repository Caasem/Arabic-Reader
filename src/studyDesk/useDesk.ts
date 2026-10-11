import { useCallback, useEffect, useState } from 'react';
import { getBlobStore } from '../blobStore';
import type { BookMeta } from '../types';
import { addItem, bookDeskId, ensureBookDesk, getDesk, listDesks, listItems, onDeskChange, updateItem } from './deskStore';
import type { Desk, DeskItem, NewDeskItem } from './types';

const CURRENT_KEY = (bookId: string) => `studyDesk.current.${bookId}`;

function loadCurrent(bookId: string): string | null {
  try {
    return localStorage.getItem(CURRENT_KEY(bookId));
  } catch {
    return null;
  }
}

function saveCurrent(bookId: string, deskId: string): void {
  try {
    localStorage.setItem(CURRENT_KEY(bookId), deskId);
  } catch {
    // Not remembered: the book's own desk is used next time.
  }
}

export interface DeskData {
  desks: Desk[];
  items: DeskItem[];
  /** The desk captures go to while this book is open. */
  deskId: string;
  setDeskId(id: string): void;
}

/** Desks and items, kept current as anything changes them. */
export function useDeskData(book: BookMeta): DeskData {
  const [desks, setDesks] = useState<Desk[]>([]);
  const [items, setItems] = useState<DeskItem[]>([]);
  const [deskId, setDeskIdState] = useState<string>(() => loadCurrent(book.id) ?? bookDeskId(book.id));

  const reload = useCallback(async () => {
    const [d, i] = await Promise.all([listDesks(), listItems()]);
    setDesks(d);
    setItems(i);
  }, []);

  useEffect(() => {
    void reload();
    return onDeskChange(() => void reload());
  }, [reload]);

  useEffect(() => setDeskIdState(loadCurrent(book.id) ?? bookDeskId(book.id)), [book.id]);

  const setDeskId = useCallback(
    (id: string) => {
      saveCurrent(book.id, id);
      setDeskIdState(id);
    },
    [book.id]
  );

  return { desks, items, deskId, setDeskId };
}

/** The desk to capture to: the chosen one if it still exists, else the book's own (made on first use). */
export async function resolveDesk(book: BookMeta, deskId: string): Promise<Desk> {
  if (deskId !== bookDeskId(book.id)) {
    const found = await getDesk(deskId);
    if (found) return found;
  }
  return ensureBookDesk(book);
}

export async function capture(book: BookMeta, deskId: string, input: NewDeskItem, image?: Blob): Promise<DeskItem> {
  const desk = await resolveDesk(book, deskId);
  const item = await addItem(desk.id, input);
  if (image) {
    const ref = await getBlobStore().put(image, { ns: 'desk', owner: item.id, type: image.type || 'image/png' });
    await updateItem(item.id, { imageHash: ref.hash });
  }
  return item;
}

/** Mostly Arabic letters: shown right to left. */
export function looksArabic(text: string): boolean {
  const letters = text.replace(/[\s\d.,:;!?'"()[\]-]/g, '');
  if (!letters) return false;
  const arabic = letters.match(/[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/g)?.length ?? 0;
  return arabic / letters.length > 0.4;
}

/** An object URL for a desk image, revoked when the component goes. */
export function useDeskImage(hash: string | undefined): string | undefined {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!hash) return;
    let alive = true;
    let made: string | undefined;
    void getBlobStore()
      .url(hash)
      .then((u) => {
        made = u;
        if (alive) setUrl(u);
        else if (u) URL.revokeObjectURL(u);
      });
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [hash]);
  return url;
}

export const TYPE_LABEL: Record<DeskItem['type'], string> = {
  concept: 'Concept',
  quote: 'Quote',
  capture: 'Capture',
  note: 'Note',
  line: 'Ḥāshiya note',
  question: 'Question',
  card: 'Flashcard',
};

/** What a row shows as its main text. */
export function itemTitle(item: DeskItem): string {
  return item.text || item.body?.split('\n')[0] || (item.imageHash ? 'Screenshot' : TYPE_LABEL[item.type]);
}
