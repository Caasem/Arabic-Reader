/** A word read from a line image: its text and the span of model time steps it covers. */
export interface CtcWord {
  text: string;
  /** First and last time step the word was heard at. */
  start: number;
  end: number;
}

const segmenter = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;

/** Characters in reverse order, keeping a letter together with the vowel marks that follow it. */
export function reverseGraphemes(text: string): string {
  const parts = segmenter ? [...segmenter.segment(text)].map((s) => s.segment) : [...text];
  return parts.reverse().join('');
}

/**
 * Greedy CTC decoding of a recognizer's output (`steps` time steps of `classes` scores each, row by row).
 * Class 0 is the blank, then the character table, then a space (the table plus two classes). Repeats
 * collapse and blanks drop. The line is read left to right in the image, which for Arabic is the reverse
 * of its logical order, so each word's letters are turned round; words are returned in image order
 * (left to right) with the time steps they span, which map to horizontal positions.
 */
export function decodeCtc(scores: ArrayLike<number>, steps: number, classes: number, charset: readonly string[]): CtcWord[] {
  const spaceClass = charset.length + 1;
  const words: CtcWord[] = [];
  let letters: string[] = [];
  let start = -1;
  let end = -1;
  let previous = 0;
  const flush = () => {
    if (letters.length) words.push({ text: reverseGraphemes(letters.join('')), start, end });
    letters = [];
    start = end = -1;
  };
  for (let t = 0; t < steps; t++) {
    let best = 0;
    let bestScore = -Infinity;
    for (let c = 0; c < classes; c++) {
      const score = scores[t * classes + c];
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    if (best !== 0 && best !== previous) {
      if (best === spaceClass) flush();
      else {
        const letter = charset[best - 1];
        if (letter !== undefined) {
          if (start < 0) start = t;
          end = t;
          letters.push(letter);
        }
      }
    } else if (best !== 0 && best === previous && best !== spaceClass && start >= 0) {
      end = t;
    }
    previous = best;
  }
  flush();
  return words;
}
