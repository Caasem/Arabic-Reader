import { describe, expect, it } from 'vitest';
import { sentenceAt, sentenceSpan } from './readerMarks';

describe('sentenceSpan', () => {
  const text = 'ذهب الولد إلى المدرسة. ثم عاد إلى البيت! هل نام؟ نعم';

  it('finds the sentence around an offset', () => {
    expect(sentenceAt(text, text.indexOf('عاد'))).toBe('ثم عاد إلى البيت!');
    expect(sentenceAt(text, 0)).toBe('ذهب الولد إلى المدرسة.');
  });

  it('takes the unpunctuated tail as the last sentence', () => {
    expect(sentenceAt(text, text.length - 1)).toBe('نعم');
  });

  it('caps a very long unpunctuated stretch', () => {
    const span = sentenceSpan('كلمة '.repeat(300), 10);
    expect(span.end - span.start).toBeLessThanOrEqual(400);
  });
});
