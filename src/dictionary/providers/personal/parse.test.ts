import { describe, expect, it } from 'vitest';
import { parseDictionaryText } from './parse';
import { buildPersonalIndex } from './index';

describe('parseDictionaryText', () => {
  it('reads tab-separated lines', () => {
    expect(parseDictionaryText('a.txt', 'كِتَاب\tкнига\n\nbad line\nقلم\tручка')).toEqual([
      ['كِتَاب', 'книга'],
      ['قلم', 'ручка'],
    ]);
  });
  it('reads CSV with quotes', () => {
    expect(parseDictionaryText('a.csv', 'كتب,"писать, записывать"\n')).toEqual([['كتب', 'писать, записывать']]);
  });
  it('reads JSON arrays and maps', () => {
    expect(parseDictionaryText('a.json', '[{"word":"قلم","meaning":"ручка"},["بيت","дом"]]')).toEqual([
      ['قلم', 'ручка'],
      ['بيت', 'дом'],
    ]);
    expect(parseDictionaryText('a.json', '{"بيت":"дом"}')).toEqual([['بيت', 'дом']]);
  });
  it('reads DSL and strips tags', () => {
    const dsl = '#NAME "Baranov"\n#INDEX_LANGUAGE "Arabic"\n\nكِتَاب\n\t[m1][trn]книга[/trn][/m1]\n\t[m1]письмо[/m1]\n';
    expect(parseDictionaryText('b.dsl', dsl)).toEqual([['كِتَاب', 'книга\nписьмо']]);
  });
});

describe('numbered wide TSV', () => {
  const T = '\t';
  const text = [
    ['1', 'ا', '', '', '', '', '', '', '', '', '(أَلِفٌ)', '', 'алиф; (первая буква)'].join(T),
    ['4', ' أَ', '', '2', '', '', '', '', '', '', '', 'частица', 'обращения о;'].join(T),
  ].join('\n');
  it('is detected and read headword + joined columns', () => {
    expect(parseDictionaryText('dic.txt', text)).toEqual([
      ['ا', '(أَلِفٌ) алиф; (первая буква)'],
      ['أَ', 'частица обращения о;'],
    ]);
  });
});

describe('buildPersonalIndex', () => {
  it('matches without diacritics and with folded hamza', () => {
    const idx = buildPersonalIndex([['كِتَاب', 'книга'], ['أَمْر', 'приказ']]);
    expect(idx.byKey.get('كتاب')).toBeTruthy();
    expect(idx.byFoldedKey.get('امر')).toBeTruthy();
  });
});
