import { describe, expect, it } from 'vitest';
import { formatRoute, parseRoute, type Route } from './route';

const ROUTES: [Route, string][] = [
  [{ view: 'library' }, '#/library'],
  [{ view: 'read', bookId: 'b1' }, '#/read/b1'],
  [{ view: 'vocabLevels', bookId: 'b1' }, '#/read/b1/levels'],
  [{ view: 'vocabulary' }, '#/vocabulary'],
  [{ view: 'highlights' }, '#/highlights'],
  [{ view: 'review' }, '#/review'],
  [{ view: 'dashboard' }, '#/dashboard'],
  [{ view: 'speedReader' }, '#/speedReader'],
  [{ view: 'dictionary' }, '#/dictionary'],
  [{ view: 'dictionary', q: 'كتاب' }, '#/dictionary?q=%D9%83%D8%AA%D8%A7%D8%A8'],
];

describe('routes', () => {
  it.each(ROUTES)('round-trips %j', (route, hash) => {
    expect(formatRoute(route)).toBe(hash);
    expect(parseRoute(hash)).toEqual(route);
  });

  it('treats an empty hash as the Library', () => {
    expect(parseRoute('')).toEqual({ view: 'library' });
    expect(parseRoute('#')).toEqual({ view: 'library' });
    expect(parseRoute('#/')).toEqual({ view: 'library' });
  });

  it('accepts a hash without the slash after #', () => {
    expect(parseRoute('#vocabulary')).toEqual({ view: 'vocabulary' });
  });

  it('falls back to the Library for unknown or garbled hashes', () => {
    for (const hash of ['#/nope', '#/vocabLevels', '#/read/b1/other', '#/read/b1/levels/x', '#/library/x', '#/read/%E0%A4%A', '#/read//levels', '#???']) {
      expect(parseRoute(hash)).toEqual({ view: 'library' });
    }
  });

  it('keeps a bare #/read (no book yet)', () => {
    expect(parseRoute('#/read')).toEqual({ view: 'read' });
    expect(formatRoute({ view: 'read' })).toBe('#/read');
  });

  it('encodes book ids with slashes, spaces and symbols', () => {
    const route: Route = { view: 'read', bookId: 'a/b c?d#e' };
    const hash = formatRoute(route);
    expect(hash).toBe('#/read/a%2Fb%20c%3Fd%23e');
    expect(parseRoute(hash)).toEqual(route);
  });

  it('encodes the dictionary word, including & = + and spaces', () => {
    const route: Route = { view: 'dictionary', q: 'a b&c=d+e' };
    expect(parseRoute(formatRoute(route))).toEqual(route);
  });

  it('ignores an empty or missing q', () => {
    expect(parseRoute('#/dictionary?q=')).toEqual({ view: 'dictionary' });
    expect(parseRoute('#/dictionary?x=1')).toEqual({ view: 'dictionary' });
  });

  it('ignores q on other screens', () => {
    expect(parseRoute('#/review?q=x')).toEqual({ view: 'review' });
  });
});
