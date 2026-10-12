import { describe, expect, it } from 'vitest';
import { annotateEntry, annotateGloss } from './parse';

const roles = (gloss: string) => annotateGloss(gloss).words.map((w) => w.role);

describe('annotateGloss', () => {
  it('splits the headword line from the definition at the first colon', () => {
    expect(roles('(كَتَبَ) الكتابَ -ُ كَتْبًا: خطَّهُ.')).toEqual(['head', 'head', 'head', 'head', 'body']);
  });

  it('marks plurals up to the end of the sentence', () => {
    expect(roles('(كَتَبَ) س: خطَّهُ. (ج) كُتَّابٌ، وكَتَبَةٌ. أخرى')).toEqual([
      'head', 'head', 'body', 'plural-mark', 'plural', 'plural', 'body',
    ]);
  });

  it('marks register abbreviations as tags with an explanation', () => {
    const a = annotateGloss('(كَتَبَ) س: خطَّهُ (مج).');
    expect(a.words[a.words.length - 1]).toMatchObject({ role: 'tag', display: 'مج' });
  });

  it('marks usage examples and Quranic quotations', () => {
    expect(roles('(كَتَبَ) س: خطَّهُ. ويقال: كتب الكتابَ. ثم')).toEqual([
      'head', 'head', 'body', 'example', 'example', 'example', 'body',
    ]);
    expect(roles('(كَتَبَ) س: خطَّهُ. وفي التنزيل العزيز: كُتِبَ عَلَيْكُمْ.').slice(3)).toEqual([
      'example', 'example', 'example', 'example', 'example',
    ]);
  });

  it('recognises lead and continuation senses', () => {
    expect(annotateGloss('(كَتَبَ) س: ص').isLead).toBe(true);
    expect(annotateGloss('و- السقاءَ: خرزَه').isContinuation).toBe(true);
  });
});

describe('labels', () => {
  it('shows labels and the plural marker without brackets, with a tooltip', () => {
    const a = annotateGloss('(الأَوقية): جزء من الرطل. (ج) أواقٍ. (مع).');
    expect(a.words.find((w) => w.display === 'ج')).toMatchObject({ role: 'plural-mark', title: 'Plural' });
    expect(a.words[a.words.length - 1]).toMatchObject({ role: 'tag', display: 'مع', title: expect.stringContaining('Arabised') });
  });
  it('leaves them as plain words when switched off', () => {
    expect(annotateGloss('(س): ص (مج).', false).words.some((w) => w.role === 'tag')).toBe(false);
  });
  it('does not take a lead letter for a label', () => {
    expect(annotateGloss('(د) وتُزادُ بين الجار والمجرور').words[0].role).not.toBe('tag');
  });
});

describe('annotateEntry', () => {
  it('returns null when nothing is recognisable', () => {
    const entry = { providerId: 'alwasit', providerName: 'x', headword: 'x', senses: [{ gloss: 'plain text only' }] };
    expect(annotateEntry(entry)).toBeNull();
  });
});
