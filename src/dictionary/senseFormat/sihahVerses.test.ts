import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { findVerses, verseLines } from './sihahVerses';

const halves = (gloss: string, prev?: string) =>
  findVerses(gloss, prev).flatMap((v) => verseLines(v).map((l) => l.map((h) => gloss.slice(h.start, h.end))));

describe('findVerses', () => {
  it('splits a star-closed verse into its two halves', () => {
    const g = 'ولَعْمَظْتُ. قال الشاعر: أشْبِهْ ولا فَخْرَ فإنَّ التي * تُشْبهُها قومٌ لَعاميظُ * ولَعْمَظْتُ اللحمَ، أي انتَهَسْتهُ';
    expect(halves(g)).toEqual([['أشْبِهْ ولا فَخْرَ فإنَّ التي', 'تُشْبهُها قومٌ لَعاميظُ']]);
  });

  it('skips a note mark after the speaker', () => {
    const g = 'قال الشاعر (١) : وأخ رمثت رويسه (٢) * ونصحته في الحرب نَصْحا * وحبلٌ أَرْماثٌ، أي أَرْمامٌ.';
    expect(halves(g)[0][0]).toBe('وأخ رمثت رويسه (٢)');
  });

  it('ends a second half left open at a footnote mark or dash', () => {
    const g = 'قال الشاعر: إذا القوس وترها أيد (١) * رمى فأصاب الكلى والذرى - يقول: إذا الله';
    expect(halves(g)).toEqual([['إذا القوس وترها أيد (١)', 'رمى فأصاب الكلى والذرى']]);
  });

  it('takes the verse from the line after one that announces it', () => {
    const g = 'تنضح ذفراه بماء صب * والناضِح: البعير يسْتقى عليه';
    expect(halves(g, 'والنضيح: العرق. قال الراجز (١) :')).toEqual([['تنضح ذفراه بماء صب']]);
    expect(halves(g)).toEqual([]);
  });

  it('leaves prose, Qur’an and starless quotations alone', () => {
    expect(findVerses('قال الأصمعي: هو الذي يقال له كذا وكذا في اللغة * ثم قال')).toEqual([]);
    expect(findVerses('قال الراجز يا ابن التى تصيد الوبارا وتتفل العنبر والصوارا قال اليزيدى: التتفل')).toEqual([]);
    expect(findVerses('قال الله تعالى: ولا تقربوا الزنا * إنه كان فاحشة')).toEqual([]);
  });
});

describe('the Al-Sihah data', () => {
  it('finds a few thousand verses and keeps every half to a hemistich', () => {
    let verses = 0;
    for (const row of readFileSync('public/alsihah-data/alsihah.tsv', 'utf8').split('\n')) {
      const lines = row.slice(row.indexOf('\t') + 1).split(/<br\s*\/?>/i);
      lines.forEach((g, i) => {
        for (const v of findVerses(g, lines[i - 1])) {
          verses++;
          for (const h of v.hemistichs) expect(g.slice(h.start, h.end).split(/\s+/).length).toBeLessThanOrEqual(15);
        }
      });
    }
    expect(verses).toBeGreaterThan(3000);
  });
});
