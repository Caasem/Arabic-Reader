import { describe, expect, it } from 'vitest';
import { classifyVerbForm } from './classifyForm';

// Every lemma below is a real `;; lemma` marker from public/dictionary-data/dictstems.
describe('classifyVerbForm', () => {
  it.each([
    ['katab', 'I'], // كتب
    ['Ealim', 'I'], // علم, CaCiC
    ['$agal', 'I'], // شغل
    ['qalab', 'I'], // قلب
    ['Eal~am', 'II'],
    ['$ag~al', 'II'],
    ['qal~ab', 'II'],
    ['kAtab', 'III'],
    ['$Agal', 'III'],
    ['>akotab', 'IV'],
    ['>aEolam', 'IV'],
    ['>a$ogal', 'IV'],
    ['taEal~am', 'V'],
    ['taqal~ab', 'V'],
    ['takAtab', 'VI'],
    ['ta$Agal', 'VI'],
    ['{inokatab', 'VII'],
    ['{ino$agal', 'VII'],
    ['{inoqalab', 'VII'],
    ['{ikotatab', 'VIII'],
    ['{i$otagal', 'VIII'],
    ['{isotakotab', 'X'],
    ['{isotaEolam', 'X'],
  ])('%s is Form %s', (lemma, form) => {
    expect(classifyVerbForm(lemma)).toBe(form);
  });

  it('gives no form to anything it does not recognise', () => {
    expect(classifyVerbForm('kitAb')).toBeUndefined();
    expect(classifyVerbForm('')).toBeUndefined();
    expect(classifyVerbForm('---')).toBeUndefined();
  });
});
