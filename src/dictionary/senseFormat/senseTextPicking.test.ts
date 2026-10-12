import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { buildEntryTokens } from '../../components/reader/definitionTokens';
import type { DictionaryEntry } from '../../types';
import { HansWehrMeaning } from './HansWehrMeaning';
import { SenseText, type WordPicking } from './SenseText';

const noop = () => {};

function picking(entry: DictionaryEntry, selected: number[] = []): WordPicking {
  return { tokens: buildEntryTokens(entry).senses[0].gloss, entryIdx: 4, selected: new Set(selected), onPointerDown: noop };
}

const text = (html: string) => html.replace(/<[^>]*>/g, '');
const tokenSpans = (html: string): [number, string][] => [...html.matchAll(/<span data-entry="4" data-idx="(\d+)" class="dict-popup__token[^"]*">([^<]*)<\/span>/g)].map((m) => [Number(m[1]), m[2]]);

describe('SenseText with word picking', () => {
  const gloss = 'حَسَدٌ Envy; or (S, K,) the wishing that a blessing may depart.';
  const headLength = 'حَسَدٌ'.length;
  const envy: [number, number] = [gloss.indexOf('Envy'), gloss.indexOf('Envy') + 4];
  const entry: DictionaryEntry = { providerId: 'lane', providerName: 'Lane', headword: 'حَسَدٌ', headLength, senses: [{ gloss, italics: [envy] }] };
  const html = renderToStaticMarkup(createElement(SenseText, { text: gloss, style: 'lane', spans: [envy], from: headLength, lead: false, picking: picking(entry, [3]) }));

  it('draws exactly the text it would without picking', () => {
    const plain = renderToStaticMarkup(createElement(SenseText, { text: gloss, style: 'lane', spans: [envy], from: headLength, lead: false }));
    expect(text(html)).toBe(text(plain));
    expect(text(html)).toBe(gloss.slice(headLength));
  });

  it('makes every word of the line a token, English words included', () => {
    // A word that crosses two styled runs ("Envy" italic, ";" plain) is drawn in two pieces that share one token.
    const spans = tokenSpans(html);
    const words = new Map<number, string>();
    for (const [idx, piece] of spans) words.set(idx, (words.get(idx) ?? '') + piece);
    expect([...words.values()]).toEqual(['Envy;', 'or', '(S,', 'K,)', 'the', 'wishing', 'that', 'a', 'blessing', 'may', 'depart.']);
    expect(spans.filter(([idx]) => idx === 1).map(([, piece]) => piece)).toEqual(['Envy', ';']);
  });

  it('keeps the styled runs: the token sits inside the italic meaning and inside the sigla', () => {
    expect(html).toContain('<em class="dict-lane-meaning"><span data-entry="4"');
    expect(html).toMatch(/<span class="dict-lane-sigla"><span data-entry="4"[^>]*>\(S,<\/span>/);
  });

  it('marks the selected token', () => {
    expect(html).toMatch(/data-idx="3" class="dict-popup__token dict-popup__token--selected"/);
  });

  it('keeps an Arabic run right to left, its words picked inside the isolate', () => {
    const line = 'He envied (حَسَدُوا لَهُ) him';
    const e: DictionaryEntry = { providerId: 'lane', providerName: 'Lane', headword: 'x', senses: [{ gloss: line }] };
    const out = renderToStaticMarkup(createElement(SenseText, { text: line, style: 'lane', picking: picking(e) }));
    expect(out).toMatch(/<bdi dir="rtl" lang="ar" class="dict-sense-ar"><span data-entry="4"[^>]*>حَسَدُوا<\/span> <span data-entry="4"[^>]*>لَهُ<\/span><\/bdi>/);
  });
});

describe('HansWehrMeaning with word picking', () => {
  it('leaves the form pill alone and picks the words after it', () => {
    const gloss = 'VI to envy each other';
    const e: DictionaryEntry = { providerId: 'hanswehr', providerName: 'HW', headword: 'حسد', senses: [{ gloss }] };
    const out = renderToStaticMarkup(createElement(HansWehrMeaning, { gloss, picking: picking(e) }));
    expect(out).toContain('<span class="dict-hw-form"');
    expect(tokenSpans(out).map(([, w]) => w)).toEqual(['to', 'envy', 'each', 'other']);
  });
});
