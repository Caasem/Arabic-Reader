import type { VocabularyItem } from '../types';

/** The note type the app creates in Anki (and writes into .apkg files). */
export const NOTE_TYPE = 'Arabic Reader';
/** Stable model id for .apkg files, so re-importing an export updates the same note type. */
export const NOTE_TYPE_ID = 1759000000001;

export const FIELDS = ['Word', 'Vowelled', 'Meaning', 'Root', 'Lemma', 'POS', 'Sentence', 'SentenceTranslation', 'Book', 'Source', 'ReaderId'] as const;
export type FieldName = (typeof FIELDS)[number];
export type NoteFields = Record<FieldName, string>;

export const CSS = `.card { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; font-size: 18px; text-align: center; color: #1f2328; background: #faf7f2; }
.nightMode .card, .card.nightMode { color: #e6e8eb; background: #16181c; }
.ar { direction: rtl; unicode-bidi: isolate; font-family: "Amiri", "Noto Naskh Arabic", "Scheherazade New", "Traditional Arabic", serif; }
.word { font-size: 2.4em; line-height: 1.5; }
.vowelled { font-size: 1.8em; margin-top: .3em; }
.sentence { font-size: 1.3em; line-height: 1.8; margin-top: .8em; color: #555; }
.nightMode .sentence { color: #b8bcc4; }
.sentence b { color: #9c7a4f; }
.meaning { margin-top: .8em; line-height: 1.5; }
.meta { margin-top: .6em; font-size: .8em; color: #888; }`;

export const RECOGNISE = {
  Name: 'Recognise',
  Front: '<div class="ar word">{{Word}}</div>\n{{#Sentence}}<div class="ar sentence">{{Sentence}}</div>{{/Sentence}}',
  Back:
    '{{FrontSide}}\n<hr id="answer">\n{{#Vowelled}}<div class="ar vowelled">{{Vowelled}}</div>{{/Vowelled}}\n<div class="meaning">{{Meaning}}</div>\n' +
    '{{#SentenceTranslation}}<div class="meta">{{SentenceTranslation}}</div>{{/SentenceTranslation}}\n' +
    '{{#Root}}<div class="meta">Root <span class="ar">{{Root}}</span>{{#POS}} · {{POS}}{{/POS}}</div>{{/Root}}\n' +
    '<div class="meta">{{Book}}{{#Source}} · {{Source}}{{/Source}}</div>',
};

/** Anki fields are HTML. */
export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const html = (text: string | undefined) => escapeHtml(text ?? '').replace(/\n/g, '<br>');

/** The sentence with the saved word in bold (first occurrence, ignoring diacritics). */
export function sentenceWithWord(sentence: string | undefined, word: string): string {
  if (!sentence) return '';
  const strip = (s: string) => s.replace(/[ً-ٰٟـ]/g, '');
  const target = strip(word);
  if (!target) return html(sentence);
  // Find the word in the sentence by comparing without diacritics, then wrap the original span.
  const chars = Array.from(sentence);
  for (let start = 0; start < chars.length; start++) {
    let matched = '';
    for (let end = start; end < chars.length && matched.length < target.length + 1; end++) {
      matched = strip(chars.slice(start, end + 1).join(''));
      if (matched === target) {
        // Take the marks that follow the last letter too.
        while (end + 1 < chars.length && strip(chars[end + 1]) === '') end++;
        const before = chars.slice(0, start).join('');
        const hit = chars.slice(start, end + 1).join('');
        const after = chars.slice(end + 1).join('');
        return `${html(before)}<b>${html(hit)}</b>${html(after)}`;
      }
      if (!target.startsWith(matched)) break;
    }
  }
  return html(sentence);
}

/** The card's fields as Anki sees them. */
export function toFields(item: VocabularyItem): NoteFields {
  const entry = item.selectedEntryIndex !== undefined ? item.entries[item.selectedEntryIndex] : item.entries[0];
  const providers = [...new Set(item.entries.map((e) => e.providerName))];
  return {
    Word: html(item.surfaceForm),
    Vowelled: entry && entry.headword !== item.surfaceForm ? html(entry.headword) : '',
    Meaning: html(item.meaning),
    Root: html(item.root ?? entry?.root),
    Lemma: html(item.lemma ?? entry?.lemma),
    POS: html(item.pos ?? entry?.senses[0]?.pos),
    Sentence: sentenceWithWord(item.sentence, item.surfaceForm),
    SentenceTranslation: '',
    Book: html(item.bookTitle),
    Source: html(item.custom ? 'Written by hand' : providers.join(', ')),
    ReaderId: item.id,
  };
}

/** A short, stable fingerprint of the fields, to tell whether a note needs updating. */
export function fieldsHash(fields: NoteFields): string {
  const text = FIELDS.map((f) => fields[f]).join('\u001f');
  // FNV-1a, 32-bit: enough to notice a change; no security role.
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
