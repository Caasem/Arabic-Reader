import { describe, expect, it } from 'vitest';
import { spineIndexOfCfi } from './cfi';

describe('spineIndexOfCfi', () => {
  it('reads the spine step of range and point CFIs', () => {
    expect(spineIndexOfCfi('epubcfi(/6/2!/4/2,/1:0,/3:5)')).toBe(0);
    expect(spineIndexOfCfi('epubcfi(/6/14[chap06]!/4/2/1:0)')).toBe(6);
  });

  it('rejects non-CFIs', () => {
    expect(spineIndexOfCfi('chapter1.xhtml#note')).toBeNull();
  });
});
