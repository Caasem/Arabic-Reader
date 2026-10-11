/**
 * The Getting started checklist as data. Order matters: the tour book (public/start-here.epub) numbers its tasks in
 * this order, so change one only with the other (scripts/tour-book/).
 */
/** Where "Show me" goes. */
export type Place = 'library' | 'book' | 'hashiya';

export interface ItemDef {
  id: string;
  /** What to do, without the shortcut. */
  label: string;
  /** The shortcut, shown only on a device with a keyboard. */
  keys?: string;
  place: Place;
  /** The one-line hint "Show me" gives. `touch` is used on a phone or tablet; it falls back to `desk`. */
  hint: { desk: string; touch?: string };
}

export const ITEMS: ItemDef[] = [
  { id: 'save-word', label: 'Save a word', place: 'book', hint: { desk: 'Tap a word in the book, then press Save in the popup.' } },
  {
    id: 'dictionary-search',
    label: 'Search the dictionary',
    keys: 'Alt+D',
    place: 'book',
    hint: { desk: 'While reading, press Alt+D and type a word.', touch: 'Open a book and use the dictionary search in its dock.' },
  },
  {
    id: 'write-note',
    label: 'Write a note',
    keys: 'Alt+N',
    place: 'book',
    hint: { desk: 'Select some text, press Alt+N and write a note.', touch: 'Select some text and choose Note.' },
  },
  {
    id: 'make-flashcard',
    label: 'Make a flashcard',
    keys: 'Alt+F',
    place: 'book',
    hint: { desk: 'Press Alt+F, write a front and a back, then save.', touch: 'Open a book and make a flashcard from its dock.' },
  },
  {
    id: 'open-hashiya',
    label: 'Open the Ḥāshiya',
    keys: 'Alt+M',
    place: 'hashiya',
    hint: { desk: 'The Ḥāshiya margins are now on. Press Alt+M to hide and show them.', touch: 'The Ḥāshiya margins are now on. Use Ḥāshiya in the dock to hide and show them.' },
  },
  {
    id: 'draw-sketch',
    label: 'Draw or sketch',
    keys: 'Alt+W',
    place: 'book',
    hint: { desk: 'Press Alt+W to turn Write on and draw on the page, or Alt+K to open a sketch sheet.', touch: 'Turn Write on in the dock and draw on the page, or open a sketch sheet.' },
  },
  {
    // Definition: ink or a sketch sheet made on a PDF page, or ink written on a Ḥāshiya card pulled in from another book.
    id: 'draw-other-source',
    label: 'Draw on something from another source',
    place: 'library',
    hint: {
      desk: 'Open a PDF and draw on one of its pages with Write on, or pull a card in from another book (Alt+U) and write on it.',
      touch: 'Open a PDF and draw on one of its pages with Write on.',
    },
  },
];

export const ITEM_IDS: string[] = ITEMS.map((i) => i.id);
