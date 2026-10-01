import { describe, expect, it } from 'vitest';
import { entryGist } from './entryGist';

// First senses of real Al-Wasit entries (public/alwasit-data/alwasit.tsv).
describe('entryGist', () => {
  it('takes the words after the headword line', () => {
    expect(entryGist('(قَتَرَ) فلانٌ -ُ قَتْرًا: ضاق عَيْشُه. و - على عياله: ضيَّقَ عليهم في النففة.')).toBe('ضاق عَيْشُه');
    expect(entryGist('(قَرَا) فلانًا -ُ قَرْواً: قصده. و - تتبَّعه و نظَر أَعمالَه.')).toBe('قصده');
    expect(entryGist('(جَهَدَ)-َ جَهْداً: جدَّ. ويقال: جَهَدَ في الأَمر.')).toBe('جدَّ');
  });

  it('works on a short entry with no colon after the form', () => {
    expect(entryGist('(تَقَاتَرَ) القومُ تخاتلوا.')).toBe('القومُ تخاتلوا');
  });

  it('keeps at most three words', () => {
    expect(entryGist('(جُهِدَ) الناسُ: أَجدبوا فهم مجهودون وكثيرون جدا.')).toBe('أَجدبوا فهم مجهودون');
  });

  it('copes with empty text', () => {
    expect(entryGist('')).toBe('');
  });
});
