// Builds public/start-here.epub, the "Start here" tour book, from scripts/tour-book/ch*.txt.
// Run: npm run build:tour-book. The output is deterministic (fixed file dates), so a rebuild with unchanged sources
// gives an identical file. The reader shows clean text, so the EPUB's CSS is minimal and sets no fonts or colours.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';

const here = dirname(fileURLToPath(import.meta.url));
const srcDir = join(here, 'tour-book');
const outPath = join(here, '..', 'public', 'start-here.epub');

const TITLE = 'ابدأ من هنا — Start here';
const AUTHOR = 'Arabic Reader';
// A paragraph starting with one of these (task, note) gets class="task".
const TASK_PREFIXES = ['مُهِمَّة', 'مُلاحَظَة'];
const DATE = new Date(Date.UTC(2026, 9, 11, 12, 0, 0));

// The English half of a task sits in a left-to-right isolate, so its punctuation and Arabic quotes stay in order
// inside the right-to-left page.
const LRI = '⁦';
const PDI = '⁩';
function isolate(p) {
  const i = p.indexOf(' · ');
  return i < 0 ? p : `${p.slice(0, i + 3)}${LRI}${p.slice(i + 3)}${PDI}`;
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const chapters = readdirSync(srcDir)
  .filter((f) => /^ch\d+\.txt$/.test(f))
  .sort()
  .map((f, i) => {
    const [title, ...paras] = readFileSync(join(srcDir, f), 'utf8')
      .replace(/\r/g, '')
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean);
    return { id: `ch${i + 1}`, title, paras };
  });

const page = (c) => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="ar" xml:lang="ar" dir="rtl">
<head>
  <meta charset="utf-8"/>
  <title>${esc(c.title)}</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
  <h1>${esc(c.title)}</h1>
${c.paras.map((p) => `  <p${TASK_PREFIXES.some((t) => p.startsWith(t)) ? ' class="task"' : ''}>${esc(TASK_PREFIXES.some((t) => p.startsWith(t)) ? isolate(p) : p)}</p>`).join('\n')}
</body>
</html>
`;

const nav = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="ar" xml:lang="ar" dir="rtl">
<head><meta charset="utf-8"/><title>${esc(TITLE)}</title></head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>${esc(TITLE)}</h1>
    <ol>
${chapters.map((c) => `      <li><a href="${c.id}.xhtml">${esc(c.title)}</a></li>`).join('\n')}
    </ol>
  </nav>
</body>
</html>
`;

const ncx = `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head><meta name="dtb:uid" content="urn:uuid:arabic-reader-start-here"/></head>
  <docTitle><text>${esc(TITLE)}</text></docTitle>
  <navMap>
${chapters
  .map(
    (c, i) => `    <navPoint id="np${i + 1}" playOrder="${i + 1}"><navLabel><text>${esc(c.title)}</text></navLabel><content src="${c.id}.xhtml"/></navPoint>`
  )
  .join('\n')}
  </navMap>
</ncx>
`;

const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="BookId" xml:lang="ar">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="BookId">urn:uuid:arabic-reader-start-here</dc:identifier>
    <dc:title>${esc(TITLE)}</dc:title>
    <dc:creator>${esc(AUTHOR)}</dc:creator>
    <dc:language>ar</dc:language>
    <meta property="dcterms:modified">2026-10-11T12:00:00Z</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="css" href="style.css" media-type="text/css"/>
${chapters.map((c) => `    <item id="${c.id}" href="${c.id}.xhtml" media-type="application/xhtml+xml"/>`).join('\n')}
  </manifest>
  <spine toc="ncx">
${chapters.map((c) => `    <itemref idref="${c.id}"/>`).join('\n')}
  </spine>
</package>
`;

// Minimal on purpose: the reader's own typography (font, size, Night mode) applies.
const css = `p.task { margin-top: 1.2em; }
`;

const zip = new JSZip();
const opts = { date: DATE };
zip.file('mimetype', 'application/epub+zip', { compression: 'STORE', ...opts });
zip.file(
  'META-INF/container.xml',
  `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
`,
  opts
);
zip.file('OEBPS/content.opf', opf, opts);
zip.file('OEBPS/nav.xhtml', nav, opts);
zip.file('OEBPS/toc.ncx', ncx, opts);
zip.file('OEBPS/style.css', css, opts);
for (const c of chapters) zip.file(`OEBPS/${c.id}.xhtml`, page(c), opts);

const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', mimeType: 'application/epub+zip' });
writeFileSync(outPath, buf);
console.log(`Wrote ${outPath} (${buf.length} bytes, ${chapters.length} chapters)`);
