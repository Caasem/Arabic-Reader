/**
 * Best-effort extraction of the sentence containing a clicked `.ar-word`
 * span, used for the (opt-in) sentence-context feature — see
 * `sentenceContextEnabled` in Settings. This is deliberately approximate:
 * Arabic prose doesn't always use consistent punctuation, and a "sentence"
 * boundary detector is its own rabbit hole. Good enough here means "a
 * short, readable chunk of surrounding text a learner would recognize,"
 * not a linguistically rigorous sentence split.
 */

/** Arabic and Latin sentence-ending punctuation. */
const SENTENCE_END = /([.!؟]+)\s*/g;

/** If no punctuation is found within this many characters either side of
 * the word, fall back to a fixed-size window instead of returning a
 * potentially-huge unpunctuated block (some texts — poetry, verse lists —
 * go long stretches without a period). */
const FALLBACK_WINDOW_CHARS = 140;
const MAX_SENTENCE_CHARS = 400;

export function extractSentence(wordEl: HTMLElement): string | null {
  const block = wordEl.closest('p, li, blockquote, td, div, h1, h2, h3, h4, h5, h6') as HTMLElement | null;
  if (!block) return null;
  const doc = wordEl.ownerDocument;
  const fullText = block.textContent || '';
  if (!fullText.trim()) return null;

  let offsetBeforeWord: number;
  try {
    const range = doc.createRange();
    range.selectNodeContents(block);
    range.setEndBefore(wordEl);
    offsetBeforeWord = range.toString().length;
  } catch {
    return null; // wordEl isn't actually inside block in a Range-friendly way — bail rather than guess
  }

  SENTENCE_END.lastIndex = 0;
  let start = 0;
  let match: RegExpExecArray | null;
  while ((match = SENTENCE_END.exec(fullText))) {
    const end = match.index + match[0].length;
    if (offsetBeforeWord < end) {
      const sentence = fullText.slice(start, end).trim();
      if (sentence.length <= MAX_SENTENCE_CHARS) return sentence || null;
      break; // punctuated, but the "sentence" is unreasonably long — fall through to windowing
    }
    start = end;
  }

  // No sentence-ending punctuation found before the next one after the
  // word (or the punctuated span was too long) — use a fixed window
  // around the word instead of the whole unbounded block.
  const windowStart = Math.max(0, offsetBeforeWord - FALLBACK_WINDOW_CHARS);
  const windowEnd = Math.min(fullText.length, offsetBeforeWord + FALLBACK_WINDOW_CHARS);
  const windowed = fullText.slice(windowStart, windowEnd).trim();
  if (!windowed) return null;
  return (windowStart > 0 ? '… ' : '') + windowed + (windowEnd < fullText.length ? ' …' : '');
}
