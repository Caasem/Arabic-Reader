import { describe, expect, it } from 'vitest';
import { arabicRuns, leadRun, senseSegments, siglaRanges, translitRanges } from './senseRuns';

const cut = (t: string, rs: [number, number][]) => rs.map(([a, b]) => t.slice(a, b));

describe('arabicRuns', () => {
  it('finds Arabic words and joins them across spaces', () => {
    const t = 'He gave أَبَرَ الكَلْبِ the dog';
    expect(cut(t, arabicRuns(t))).toEqual(['أَبَرَ الكَلْبِ']);
  });
  it('keeps separate runs apart when Latin sits between', () => {
    const t = '(ه, هـ s.th.)';
    expect(cut(t, arabicRuns(t))).toEqual(['ه', 'هـ']);
  });
});

describe('siglaRanges', () => {
  it('finds groups of abbreviations, with their trailing punctuation', () => {
    const t = 'He prepared (AZ, S, M, A, K,) and (TA.) then (Msb:) and (S, K;) (Akh, S,) (CK) (&c.)';
    expect(cut(t, siglaRanges(t))).toEqual(['(AZ, S, M, A, K,)', '(TA.)', '(Msb:)', '(S, K;)', '(Akh, S,)', '(CK)']);
  });
  it('leaves other brackets alone', () => {
    const t = "(a camel's) [app., so] (He) (the sheep) (S and K) (أَبَدَ) ()";
    expect(siglaRanges(t)).toEqual([]);
  });
});

describe('translitRanges', () => {
  it('mutes the transliteration and conjugation vowels after the opening Arabic word', () => {
    const t = 'حسد ḥasada u (ḥasad) to envy';
    expect(cut(t, translitRanges(t))).toEqual(['ḥasada u', 'ḥasad']);
  });
  it('takes a plain word right after the Arabic head, and up to a few vowels', () => {
    const t = 'خلج kalaja i and to be';
    expect(cut(t, translitRanges(t))).toEqual(['kalaja i']);
    const u = 'كتب kataba a u to write';
    expect(cut(u, translitRanges(u))).toEqual(['kataba a u']);
  });
  it('finds diacritic words later in the line, ayn included', () => {
    const t = 'خلع kala‘a a (kal‘) to take off │حرق قلبه (qalbahū) to vex';
    expect(cut(t, translitRanges(t))).toContain('kala‘a a');
    expect(cut(t, translitRanges(t))).toContain('qalbahū');
  });
  it('leaves plain English alone', () => {
    const t = 'to envy each other, one’s heart';
    expect(translitRanges(t)).toEqual([]);
  });
});

describe('leadRun', () => {
  it('is the opening Arabic run only', () => {
    expect(leadRun('أَبَدَ 1 , aor.')).toEqual([0, 6]);
    expect(leadRun('He said أَبَدَ')).toBeNull();
  });
});

describe('senseSegments', () => {
  it('always rebuilds the text', () => {
    const t = 'أَبَدَ 1 , (T, S,) He remained, بِمَكَانٍ in a place; (K.)';
    const spans: [number, number][] = [[t.indexOf('He remained'), t.indexOf('He remained') + 11]];
    expect(senseSegments(t, { style: 'lane', spans }).map((s) => s.text).join('')).toBe(t);
    expect(senseSegments(t, { style: 'lane', spans, from: 5 }).map((s) => s.text).join('')).toBe(t.slice(5));
  });
  it('marks lead, italics, sigla and Arabic for Lane', () => {
    const t = 'أَبَدَ 1 (S, K,) He stayed بِمَكَانٍ';
    const i = t.indexOf('He');
    const segs = senseSegments(t, { style: 'lane', spans: [[i, i + 9]] });
    expect(segs[0]).toMatchObject({ arabic: true, lead: true, kind: 'plain' });
    expect(segs.find((s) => s.kind === 'sigla')?.text).toBe('(S, K,)');
    expect(segs.find((s) => s.kind === 'italic')?.text).toBe('He stayed');
    expect(segs.filter((s) => s.lead)).toHaveLength(1);
    expect(segs[segs.length - 1]).toMatchObject({ arabic: true, lead: false });
  });
  it('has no lead when asked not to, and no extras for plain text', () => {
    const t = 'أَبَدَ (S) x';
    expect(senseSegments(t, { style: 'lane', lead: false }).some((s) => s.lead)).toBe(false);
    expect(senseSegments(t).some((s) => s.kind === 'sigla' || s.lead)).toBe(false);
  });
  it('marks Hans Wehr transliteration', () => {
    const segs = senseSegments('حسد ḥasada u (ḥasad) to envy', { style: 'hanswehr' });
    expect(segs.filter((s) => s.kind === 'translit').map((s) => s.text)).toEqual(['ḥasada u', 'ḥasad']);
    expect(segs[0]).toMatchObject({ arabic: true, lead: true });
  });
  it('handles empty input', () => {
    expect(senseSegments('')).toEqual([]);
  });
});
