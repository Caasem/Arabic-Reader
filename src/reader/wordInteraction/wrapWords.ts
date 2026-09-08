import { tokenize } from '../tokenizer/arabicTokenizer';

/**
 * Walks all text nodes under `root` (an epub.js section's rendered
 * Document/element) and replaces each Arabic-letter run with an interactive
 * `<span class="ar-word" data-word="...">` wrapper, leaving everything else
 * (Latin text, punctuation, whitespace) untouched.
 *
 * This is the only place that mutates rendered book DOM. It deliberately
 * does not attach click handlers itself — the caller attaches a single
 * delegated listener on `root`, per the existing extension's approach, so
 * this function stays a pure "tag the words" step.
 */
export function wrapArabicWords(root: Document | HTMLElement): number {
  const doc = 'body' in root ? (root as Document) : (root.ownerDocument as Document);
  const body = 'body' in root ? (root as Document).body : (root as HTMLElement);
  if (!body) return 0;

  let wrapped = 0;
  const walker = doc.createTreeWalker(body, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      if (parent.classList.contains('ar-word')) return NodeFilter.FILTER_REJECT;
      if (parent.closest('.ar-word')) return NodeFilter.FILTER_REJECT;
      if (['SCRIPT', 'STYLE'].includes(parent.tagName)) return NodeFilter.FILTER_REJECT;
      return /[؀-ۿ]/.test(node.textContent || '') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });

  const textNodes: Text[] = [];
  let n: Node | null;
  while ((n = walker.nextNode())) textNodes.push(n as Text);

  for (const textNode of textNodes) {
    const text = textNode.textContent || '';
    const tokens = tokenize(text);
    if (!tokens.some((t) => t.isArabic)) continue;

    const frag = doc.createDocumentFragment();
    for (const t of tokens) {
      if (t.isArabic) {
        const span = doc.createElement('span');
        span.className = 'ar-word';
        span.dataset.word = t.text;
        span.textContent = t.text;
        frag.appendChild(span);
        wrapped++;
      } else {
        frag.appendChild(doc.createTextNode(t.text));
      }
    }
    textNode.parentNode?.replaceChild(frag, textNode);
  }

  return wrapped;
}

/** Collects the distinct set of Arabic surface forms present in a rendered
 * section, used to record one "encounter" per distinct word per section
 * rather than one per DOM node. */
export function distinctWordsIn(root: Document | HTMLElement): string[] {
  const scope: ParentNode = 'body' in root ? (root as Document) : (root as HTMLElement);
  const nodes = scope.querySelectorAll('.ar-word');
  const seen = new Set<string>();
  nodes.forEach((el) => {
    const w = (el as HTMLElement).dataset.word;
    if (w) seen.add(w);
  });
  return Array.from(seen);
}
