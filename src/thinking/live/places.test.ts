import { describe, expect, it } from 'vitest';
import type { DeskItem } from '../../studyDesk/types';
import { anchorIn, boxOnPage, livePlace, runAround, sentencesIn, viewFor } from './places';

const item = (location: string): DeskItem =>
  ({ id: 'x', deskId: 'd', type: 'quote', text: 't', createdAt: 0, updatedAt: 0, inInbox: false, source: { bookId: 'b', location } }) as DeskItem;

describe('live Muqābala places', () => {
  it('reads text spans and PDF boxes', () => {
    expect(livePlace(item('clean:3:10:24'))).toEqual({ view: 'text', chapter: 3, start: 10, end: 24 });
    expect(livePlace(item('pdf:7:0.1000:0.2000:0.5000:0.0500'))).toEqual({ view: 'pages', page: 7, x: 0.1, y: 0.2, w: 0.5, h: 0.05 });
    expect(livePlace(item('pdf:page=4'))).toMatchObject({ view: 'pages', page: 4, y: 0 });
    expect(livePlace(item('epubcfi(/6/4)'))).toBeNull();
  });

  it('opens a pane in the view its passage needs', () => {
    expect(viewFor(item('pdf:2:0:0:1:1'), 'text')).toBe('pages');
    expect(viewFor(item('clean:0:0:5'), 'pages')).toBe('text');
    expect(viewFor(undefined, 'pages')).toBe('pages');
  });

  it('turns a selection on a page into fractions of the page, ignoring rects off it', () => {
    const page = { left: 100, top: 200, right: 300, bottom: 600 };
    const box = boxOnPage(
      [
        { left: 120, top: 240, right: 200, bottom: 260 },
        { left: 110, top: 260, right: 180, bottom: 280 },
        { left: 400, top: 240, right: 500, bottom: 260 },
      ],
      page,
    );
    expect(box).toEqual({ x: 0.05, y: 0.1, w: 0.45, h: 0.1 });
    expect(boxOnPage([{ left: 0, top: 0, right: 50, bottom: 50 }], page)).toBeNull();
  });

  it('pins a wire to the pane edge when its passage is out of sight', () => {
    expect(anchorIn(300, false, 100, 500)).toEqual({ y: 300, off: false });
    expect(anchorIn(50, false, 100, 500)).toEqual({ y: 110, off: true });
    expect(anchorIn(900, false, 100, 500)).toEqual({ y: 490, off: true });
    expect(anchorIn(null, true, 100, 500)).toEqual({ y: 110, off: true });
    expect(anchorIn(null, false, 100, 500)).toEqual({ y: 490, off: true });
  });
});

describe('every passage clickable', () => {
  it('splits a block into sentences, trimming the spaces around them', () => {
    const text = 'كان هناك رجل قوي. يعيش في قرية! هل رأيته؟ نعم';
    const parts = sentencesIn(text, 10).map((s) => text.slice(s.start - 10, s.end - 10));
    expect(parts).toEqual(['كان هناك رجل قوي.', 'يعيش في قرية!', 'هل رأيته؟', 'نعم']);
  });

  it('keeps numbers and closing quotes with their sentence', () => {
    const text = 'He said "go now." Then 1.5 metres… later';
    const parts = sentencesIn(text).map((s) => text.slice(s.start, s.end));
    expect(parts).toEqual(['He said "go now."', 'Then 1.5 metres…', 'later']);
  });

  it('gives a block without stops as one passage, and nothing for blank text', () => {
    expect(sentencesIn('  بسم الله الرحمن الرحيم  ')).toEqual([{ start: 2, end: 24 }]);
    expect(sentencesIn('   ')).toEqual([]);
  });

  it('groups text-layer runs into the sentence around a run', () => {
    const run = (text: string, top: number) => ({ text, top, height: 10 });
    const runs = [run('أول جملة.', 0), run('ثانية تبدأ', 12), run('وتستمر هنا', 24), run('وتنتهي.', 36), run('ثالثة', 48)];
    expect(runAround(runs, 2)).toEqual([1, 3]);
    expect(runAround(runs, 0)).toEqual([0, 0]);
    expect(runAround(runs, 4)).toEqual([4, 4]);
  });

  it('stops a PDF passage at a paragraph gap and after a few runs', () => {
    const runs = [0, 12, 60, 72].map((top) => ({ text: 'بلا نقطة', top, height: 10 }));
    expect(runAround(runs, 1)).toEqual([0, 1]);
    const long = Array.from({ length: 20 }, (_, k) => ({ text: 'بلا نقطة', top: k * 12, height: 10 }));
    expect(runAround(long, 10, 3)).toEqual([7, 13]);
  });
});
