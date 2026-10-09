/**
 * The study desk (docs/features/study-desk.md): everything noticed while reading becomes an item, items
 * collect on a desk, and the desk is one free text document with its items embedded in it.
 */

/** What an item is. Margin notes start as `line` (plain text) and can be turned into the others. */
export type DeskItemType = 'concept' | 'quote' | 'capture' | 'note' | 'line' | 'question' | 'card';

/** Where an item came from. */
export interface DeskSource {
  bookId: string;
  bookTitle?: string;
  /** A clean-text place ("clean:<chapter>:<start>:<end>"), an epub CFI, or a PDF box ("pdf:<page>:<x>:<y>:<w>:<h>", fractions of the page). */
  location?: string;
  chapterLabel?: string;
}

/** Where an item sits in a margin of the reader. */
export interface DeskPin {
  bookId: string;
  /** The place on the page it is level with (same forms as DeskSource.location). */
  location: string;
  side: 'left' | 'right';
}

/**
 * A pile of margin cards (piles.ts): one card on top, the rest beneath it in order. Every member carries the
 * pile's id, its own place in it, and the pile's name and colour tab, so no other table is needed.
 */
export interface DeskPile {
  id: string;
  /** 0 is the top card; larger is further down. */
  order: number;
  name?: string;
  /** The colour tab, a CSS colour. */
  color?: string;
}

export interface DeskItem {
  id: string;
  deskId: string;
  type: DeskItemType;
  /** The concept, the quoted words, the front of a card, or empty for a plain margin note. */
  text: string;
  /** What the item says beside its quote (a margin note's lines, a card's back). Plain text, lines separated by "\n". */
  body?: string;
  /** Arabic text, shown right to left. */
  ar?: boolean;
  source?: DeskSource;
  pin?: DeskPin;
  /** An image in the BlobStore (namespace "desk", owner = item id). */
  imageHash?: string;
  /** In the inbox list. Captures always are; margin notes only once sent. */
  inInbox: boolean;
  /** Margin notes only: shown in the desk document. Unset follows the desk setting. */
  inDocument?: boolean;
  /** Written in a margin rather than captured. */
  fromMargin?: boolean;
  /** Hidden from the document but kept on the desk. */
  hidden?: boolean;
  /** A card made from this item was added to review (vocabulary id). */
  reviewId?: string;
  /** In a pile in the margin. A pile of one is no pile and is shown as a lone card. */
  pile?: DeskPile;
  createdAt: number;
  updatedAt: number;
}

export type DeskKind = 'book' | 'own';

export interface Desk {
  id: string;
  kind: DeskKind;
  /** Book desks: the book. */
  bookId?: string;
  title: string;
  /** The document: sanitized HTML (see docHtml.ts) with items embedded as `<div class="desk-embed" data-item="…">`. */
  html: string;
  createdAt: number;
  updatedAt: number;
}

export type NewDeskItem = Omit<DeskItem, 'id' | 'deskId' | 'createdAt' | 'updatedAt' | 'inInbox'> & { inInbox?: boolean };
