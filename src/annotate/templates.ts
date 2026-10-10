import type { SketchNodeKind } from './types';

/**
 * Ready-made diagrams for studying Arabic (the sketch panel's Templates menu). Positions are around the middle of
 * the view; each arrow goes from the first node to the second. The words are placeholders to write over.
 */
export interface Template {
  id: string;
  label: string;
  hint: string;
  nodes: { text: string; kind?: SketchNodeKind; x: number; y: number }[];
  edges: [number, number][];
}

export const TEMPLATES: Template[] = [
  {
    id: 'root',
    label: 'Root family',
    hint: 'A root and the words made from it',
    nodes: [
      { text: 'Root: ك ت ب', kind: 'note', x: 0, y: 0 },
      { text: 'Verb (فَعَلَ)', x: -270, y: 130 },
      { text: 'Noun (فِعال)', x: -90, y: 130 },
      { text: 'Doer (فاعِل)', x: 90, y: 130 },
      { text: 'Place (مَفْعَل)', x: 270, y: 130 },
      { text: 'Done to (مَفْعول)', x: 0, y: 250 },
    ],
    edges: [
      [0, 1],
      [0, 2],
      [0, 3],
      [0, 4],
      [0, 5],
    ],
  },
  {
    id: 'irab',
    label: 'I‘rāb of a sentence',
    hint: 'A sentence, its parts and their cases',
    nodes: [
      { text: 'The sentence', kind: 'quote', x: 0, y: 0 },
      { text: 'مُبْتَدَأ · subject', x: -180, y: 130 },
      { text: 'خَبَر · predicate', x: 180, y: 130 },
      { text: 'Case and sign: مَرْفوع (ـُ)', kind: 'note', x: -180, y: 250 },
      { text: 'Case and sign: مَرْفوع (ـُ)', kind: 'note', x: 180, y: 250 },
    ],
    edges: [
      [0, 1],
      [0, 2],
      [1, 3],
      [2, 4],
    ],
  },
  {
    id: 'argument',
    label: 'Argument map',
    hint: 'A claim, its reasons, and what speaks against it',
    nodes: [
      { text: 'Claim', kind: 'note', x: 0, y: 0 },
      { text: 'Reason', x: -200, y: 130 },
      { text: 'Reason', x: 0, y: 130 },
      { text: 'Objection', x: 200, y: 130 },
      { text: 'Evidence (quote it)', kind: 'quote', x: -200, y: 250 },
      { text: 'Reply', x: 200, y: 250 },
    ],
    edges: [
      [0, 1],
      [0, 2],
      [0, 3],
      [1, 4],
      [3, 5],
    ],
  },
];
