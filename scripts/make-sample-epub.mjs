// Builds a small, realistic Arabic-language sample EPUB used to demo the
// reader without requiring the user to supply their own book. Vocabulary is
// deliberately drawn from src/dictionary/providers/mockData.ts so every
// clickable word the reader highlights actually resolves in the mock
// dictionaries.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = join(__dirname, '..', 'public', 'sample-book.epub');

const chapters = [
  {
    id: 'ch1',
    title: 'الفصل الأول: القرية',
    body: `
      <p>كَانَ هُنَاكَ رَجُلٌ قَوِيٌّ يَعِيشُ فِي قَرْيَةٍ صَغِيرَةٍ قُرْبَ نَهْرٍ جَمِيلٍ. كَانَ اسْمُهُ فَتَى، وَكَانَ لَهُ صَدِيقٌ يُدْعَى وَلَدٌ يُحِبُّ الْقِرَاءَةَ.</p>
      <p>فِي كُلِّ يَوْمٍ، كَانَ الْفَتَى يَمْشِي إِلَى الْحَقْلِ الْكَبِيرِ بِجَانِبِ شَجَرَةٍ عَالِيَةٍ، وَكَانَ يَرَى الشَّمْسَ تُشْرِقُ فَوْقَ الْجَبَلِ.</p>
      <p>ذَهَبَ الْفَتَى إِلَى الْبَيْتِ فِي الْمَسَاءِ، وَقَالَ لِأُمِّهِ: "رَأَيْتُ الْيَوْمَ مَكَانًا جَمِيلًا بِجَانِبِ الْبَحْرِ."</p>
    `,
  },
  {
    id: 'ch2',
    title: 'الفصل الثاني: المدرسة',
    body: `
      <p>ذَهَبَتْ الْبِنْتُ إِلَى الْمَدْرَسَةِ صَبَاحًا، وَقَابَلَتْ الْمُعَلِّمَ الَّذِي يُحِبُّ أَنْ يَقْرَأَ كِتَابًا كُلَّ يَوْمٍ.</p>
      <p>سَأَلَتْ الْبِنْتُ الْمُعَلِّمَ سُؤَالًا عَنِ النُّجُومِ، فَقَالَ لَهَا: "انْظُرِي إِلَى السَّمَاءِ فِي اللَّيْلِ، سَتَرَيْنَ الْقَمَرَ وَالنَّجْمَةَ الْكَبِيرَةَ."</p>
      <p>أَرَادَتْ الْبِنْتُ أَنْ تَكْتُبَ جَوَابًا فِي كِتَابِهَا، فَبَحَثَتْ عَنِ الطَّرِيقِ إِلَى مَكْتَبَةِ الْمَدْرَسَةِ.</p>
    `,
  },
  {
    id: 'ch3',
    title: 'الفصل الثالث: الطريق إلى البحر',
    body: `
      <p>عَرَفَ الرَّجُلُ الطَّرِيقَ الطَّوِيلَ الَّذِي يُؤَدِّي إِلَى الْبَحْرِ الْكَبِيرِ، فَمَشَى مَعَ صَدِيقِهِ فَوْقَ أَرْضٍ وَاسِعَةٍ.</p>
      <p>عِنْدَمَا وَصَلَا، رَأَيَا الشَّمْسَ تَغْرُبُ فَوْقَ الْبَحْرِ، وَكَانَ الْمَنْظَرُ جَمِيلًا جِدًّا.</p>
      <p>قَالَ الصَّدِيقُ: "هَذَا الْمَكَانُ هُوَ أَجْمَلُ مَكَانٍ رَأَيْتُهُ فِي حَيَاتِي." وَوَافَقَهُ الرَّجُلُ الْقَوِيُّ عَلَى ذَلِكَ.</p>
    `,
  },
];

const zip = new JSZip();
zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });

zip.file(
  'META-INF/container.xml',
  `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`
);

const manifestItems = chapters
  .map((c) => `<item id="${c.id}" href="${c.id}.xhtml" media-type="application/xhtml+xml"/>`)
  .join('\n    ');
const spineItems = chapters.map((c) => `<itemref idref="${c.id}"/>`).join('\n    ');
const navPoints = chapters
  .map(
    (c, i) => `<navPoint id="navpoint-${i + 1}" playOrder="${i + 1}">
      <navLabel><text>${c.title}</text></navLabel>
      <content src="${c.id}.xhtml"/>
    </navPoint>`
  )
  .join('\n    ');

zip.file(
  'OEBPS/content.opf',
  `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="BookId">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>قرية الفتى القوي</dc:title>
    <dc:creator>عيّنة تجريبية</dc:creator>
    <dc:language>ar</dc:language>
    <dc:identifier id="BookId">urn:uuid:arabic-reader-sample-book-0001</dc:identifier>
  </metadata>
  <manifest>
    ${manifestItems}
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
  </manifest>
  <spine toc="ncx" page-progression-direction="rtl">
    ${spineItems}
  </spine>
</package>`
);

zip.file(
  'OEBPS/toc.ncx',
  `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="urn:uuid:arabic-reader-sample-book-0001"/>
  </head>
  <docTitle><text>قرية الفتى القوي</text></docTitle>
  <navMap>
    ${navPoints}
  </navMap>
</ncx>`
);

for (const c of chapters) {
  zip.file(
    `OEBPS/${c.id}.xhtml`,
    `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="ar" dir="rtl">
<head>
  <title>${c.title}</title>
  <meta charset="utf-8"/>
</head>
<body dir="rtl">
  <h1>${c.title}</h1>
  ${c.body}
</body>
</html>`
  );
}

const buf = await zip.generateAsync({ type: 'nodebuffer', mimeType: 'application/epub+zip' });
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, buf);
console.log('Wrote', outPath, buf.length, 'bytes');
