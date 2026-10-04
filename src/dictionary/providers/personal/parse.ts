/** One dictionary article: a headword and its definition text. */
export type PersonalRow = [headword: string, definition: string];

/**
 * Reads a user-supplied dictionary file into rows. Formats (picked by file
 * extension, falling back to a content sniff):
 *  - `.dsl`  Lingvo DSL: unindented headword lines, indented body lines.
 *  - `.json` an array of `{headword|word, definition|meaning|gloss}` or `[h, d]`, or a `{headword: definition}` map.
 *  - `.csv`  `headword,definition` (quotes allowed).
 *  - anything else (`.tsv`, `.txt`): `headword<TAB>definition`.
 */
export function parseDictionaryText(name: string, raw: string): PersonalRow[] {
  const text = raw.replace(/^﻿/, '');
  const ext = name.toLowerCase().split('.').pop() ?? '';
  if (ext === 'dsl') return parseDsl(text);
  if (ext === 'json') return parseJson(text);
  if (ext === 'csv') return parseCsv(text);
  const head = text.trimStart();
  if (head.startsWith('[') || head.startsWith('{')) {
    try {
      return parseJson(text);
    } catch {
      // not JSON after all -- fall through to TSV
    }
  }
  if (/^#NAME\b/m.test(text.slice(0, 2000))) return parseDsl(text);
  return looksLikeNumberedTsv(text) ? parseNumberedTsv(text) : parseTsv(text);
}

const NUMBERED_LINE_RE = /^\d+\t[^\t]*\t(?:[^\t]*\t){6,}/;

/** True for the wide legacy layout: `id⇥headword⇥…many mostly-empty columns…⇥translation`. */
export function looksLikeNumberedTsv(text: string): boolean {
  const lines = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 20);
  return lines.length > 0 && lines.filter((l) => NUMBERED_LINE_RE.test(l)).length >= lines.length * 0.8;
}

/**
 * Wide tab layout used by some Russian-Arabic dictionary dumps: the first column is a
 * numeric id, the second the headword, and the rest (vocalized form, homograph
 * number, part of speech, translation) are scattered across empty columns.
 * The definition is every later non-empty column, minus bare homograph numbers.
 */
export function parseNumberedTsv(text: string): PersonalRow[] {
  const rows: PersonalRow[] = [];
  for (const line of text.split(/\r?\n/)) {
    const cols = line.split('\t');
    if (cols.length < 3 || !/^\d+$/.test(cols[0].trim())) continue;
    const headword = cols[1].trim();
    const definition = cols
      .slice(2)
      .map((c) => c.trim())
      .filter((c) => c && !/^\d+$/.test(c))
      .join(' ')
      .replace(/\s+/g, ' ');
    if (headword && definition) rows.push([headword, definition]);
  }
  return rows;
}

export function parseTsv(text: string): PersonalRow[] {
  const rows: PersonalRow[] = [];
  for (const line of text.split(/\r?\n/)) {
    const tab = line.indexOf('\t');
    if (tab < 1) continue;
    const h = line.slice(0, tab).trim();
    const d = line.slice(tab + 1).trim();
    if (h && d) rows.push([h, d]);
  }
  return rows;
}

export function parseCsv(text: string): PersonalRow[] {
  const rows: PersonalRow[] = [];
  let field = '';
  let record: string[] = [];
  let quoted = false;
  const endRecord = () => {
    record.push(field);
    field = '';
    const h = record[0]?.trim();
    const d = record.slice(1).join(', ').trim();
    if (h && d) rows.push([h, d]);
    record = [];
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      record.push(field);
      field = '';
    } else if (c === '\n') endRecord();
    else if (c !== '\r') field += c;
  }
  if (field || record.length) endRecord();
  return rows;
}

export function parseJson(text: string): PersonalRow[] {
  const data: unknown = JSON.parse(text);
  const rows: PersonalRow[] = [];
  const add = (h: unknown, d: unknown) => {
    if (typeof h === 'string' && h.trim() && d != null) {
      const def = Array.isArray(d) ? d.join('\n') : String(d);
      if (def.trim()) rows.push([h.trim(), def.trim()]);
    }
  };
  if (Array.isArray(data)) {
    for (const item of data) {
      if (Array.isArray(item)) add(item[0], item[1]);
      else if (item && typeof item === 'object') {
        const o = item as Record<string, unknown>;
        add(o.headword ?? o.word ?? o.term ?? o.ar, o.definition ?? o.meaning ?? o.gloss ?? o.translation ?? o.ru);
      }
    }
  } else if (data && typeof data === 'object') {
    for (const [h, d] of Object.entries(data)) add(h, d);
  }
  return rows;
}

/** Lingvo DSL: strips `[tags]`, unescapes `\[`, joins the body lines of each article. */
export function parseDsl(text: string): PersonalRow[] {
  const rows: PersonalRow[] = [];
  let heads: string[] = [];
  let body: string[] = [];
  const flush = () => {
    const def = body.join('\n').trim();
    if (def) for (const h of heads) rows.push([h, def]);
    heads = [];
    body = [];
  };
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('#') || !line.trim()) continue;
    if (/^\s/.test(line)) {
      body.push(cleanDsl(line));
    } else {
      if (body.length) flush();
      const h = cleanDsl(line).replace(/\{[^}]*\}/g, '').trim();
      if (h) heads.push(h);
    }
  }
  flush();
  return rows;
}

function cleanDsl(s: string): string {
  return s
    .replace(/\\\[/g, '\uE000')
    .replace(/\\\]/g, '\uE001')
    .replace(/\[\/?[a-z][^\]]*\]/gi, '')
    .replace(/<<([^>]*)>>/g, '$1')
    .replace(/\uE000/g, '[')
    .replace(/\uE001/g, ']')
    .trim();
}
