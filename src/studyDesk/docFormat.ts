/**
 * Writing in the desk document: typed line starts that become blocks, and the toolbar's commands. Only
 * blocks the document keeps (docHtml.ts: paragraphs, one heading level, lists, quotes, bold, italic) are made.
 *
 *   "# "   heading        "- " or "* "  bulleted list
 *   "1. "  numbered list  "> "          quotation
 */

export type LineKind = 'heading' | 'bullets' | 'numbers' | 'quote';

const STARTS: [RegExp, LineKind][] = [
  [/^#[\s ]/, 'heading'],
  [/^[-*][\s ]/, 'bullets'],
  [/^1[.)][\s ]/, 'numbers'],
  [/^>[\s ]/, 'quote'],
];

/** What a line typed so far turns into, and the text left once its marker is taken off. */
export function lineStart(text: string): { kind: LineKind; rest: string } | null {
  for (const [re, kind] of STARTS) {
    const m = text.match(re);
    if (m) return { kind, rest: text.slice(m[0].length) };
  }
  return null;
}

/** Turns a top-level paragraph into the block its start asked for; returns the element to put the caret in. */
export function applyLineStart(line: HTMLElement): HTMLElement | null {
  const found = lineStart(line.textContent ?? '');
  if (!found) return null;
  const doc = line.ownerDocument;
  let block: HTMLElement;
  let caret: HTMLElement;
  if (found.kind === 'heading') {
    block = caret = doc.createElement('h3');
  } else if (found.kind === 'quote') {
    block = caret = doc.createElement('blockquote');
  } else {
    block = doc.createElement(found.kind === 'bullets' ? 'ul' : 'ol');
    caret = doc.createElement('li');
    block.appendChild(caret);
  }
  if (found.rest) caret.textContent = found.rest;
  else caret.innerHTML = '<br>';
  line.replaceWith(block);
  return caret;
}

export type FormatCommand = 'bold' | 'italic' | 'heading' | 'bullets' | 'numbers' | 'quote' | 'paragraph';

/**
 * Applies a toolbar command at the caret. execCommand is the one way to change a contenteditable that keeps
 * the browser's own undo (Ctrl+Z) working; it is old but supported everywhere this app runs.
 */
export function runFormat(cmd: FormatCommand): void {
  switch (cmd) {
    case 'bold':
    case 'italic':
      document.execCommand(cmd);
      break;
    case 'bullets':
      document.execCommand('insertUnorderedList');
      break;
    case 'numbers':
      document.execCommand('insertOrderedList');
      break;
    case 'heading':
      document.execCommand('formatBlock', false, blockAtCaret() === 'H3' ? 'p' : 'h3');
      break;
    case 'quote':
      document.execCommand('formatBlock', false, blockAtCaret() === 'BLOCKQUOTE' ? 'p' : 'blockquote');
      break;
    case 'paragraph':
      document.execCommand('formatBlock', false, 'p');
      break;
  }
}

/** The tag of the block the caret is in. */
export function blockAtCaret(): string | null {
  let n: Node | null = window.getSelection()?.anchorNode ?? null;
  while (n && !(n instanceof HTMLElement && /^(P|H3|LI|BLOCKQUOTE)$/.test(n.tagName))) n = n.parentNode;
  return n instanceof HTMLElement ? n.tagName : null;
}
