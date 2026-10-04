#!/usr/bin/env python3
"""Builds a small RTL EPUB 2 from an OCR text file whose pages are separated by
a PAGE_SEPARATOR line (the shape of the KTB .txt exports).

  python scripts/txt-to-epub.py INPUT.txt OUTPUT.epub --title T --author A [--uid ID]

Each non-empty line becomes a paragraph; lines that are only page numbers or
stray punctuation are dropped; "٣ - heading" lines become sub-headings. A new
chapter starts at a "قصة ..." heading, at the "بسم الله الرحمن الرحيم" opening
of a part, and at least every MAX_PAGES pages. Used for
public/qisas-al-nabiyyin.epub; re-run to regenerate it.
"""
import argparse
import re
import uuid
import zipfile
from xml.sax.saxutils import escape

MAX_PAGES = 12
SEP = 'PAGE_SEPARATOR'
ARABIC = re.compile(r'[؀-ۿ]')
ONLY_NUMBER = re.compile(r'^[\s\d٠-٩۰-۹.\-–—()|!]*$')
NUMBERED_HEADING = re.compile(r'^[\d٠-٩۰-۹]+\s*[-–]\s*\S')
CHAPTER_START = re.compile(r'^(قصة\s+سيدنا|قصة\s+سيدنا)')
PART_START = re.compile(r'^بسم\s+(الله|اله)\s+الرحمن\s+الرحيم')

CSS = """body { direction: rtl; text-align: right; line-height: 2; margin: 1em; font-family: 'Amiri', 'Noto Naskh Arabic', serif; }
h1 { font-size: 1.6em; text-align: center; margin: 1.2em 0 .8em; }
h2 { font-size: 1.15em; margin: 1.4em 0 .4em; }
p { margin: 0 0 .5em; }
"""


def clean_pages(text):
    pages = []
    for raw in text.replace('\r\n', '\n').split(SEP):
        lines = []
        for line in raw.split('\n'):
            line = line.strip()
            if not line or not ARABIC.search(line) or ONLY_NUMBER.match(line):
                continue
            lines.append(line)
        if lines:
            pages.append(lines)
    return pages


def split_chapters(pages):
    chapters = []  # (title, [lines], first_page, last_page)
    cur_title, cur_lines, cur_pages, first_page = None, [], 0, 1

    def flush(next_page):
        nonlocal cur_title, cur_lines, cur_pages, first_page
        if cur_lines:
            chapters.append((cur_title, cur_lines, first_page, next_page - 1))
        cur_title, cur_lines, cur_pages, first_page = None, [], 0, next_page

    for n, lines in enumerate(pages, 1):
        first = lines[0]
        starts = bool(CHAPTER_START.match(first) or PART_START.match(first))
        if (starts and cur_lines) or cur_pages >= MAX_PAGES:
            flush(n)
        if cur_title is None:
            cur_title = first if CHAPTER_START.match(first) else None
        cur_lines.extend(lines)
        cur_pages += 1
    flush(len(pages) + 1)
    named = []
    for title, lines, a, b in chapters:
        label = (title or '').strip()
        if len(label) > 60:
            label = label[:60].rsplit(' ', 1)[0] + '…'
        named.append((label or f'صفحات {a}–{b}', lines))
    return named


def chapter_xhtml(title, lines):
    body = []
    for line in lines:
        tag = 'h2' if NUMBERED_HEADING.match(line) else 'p'
        body.append(f'<{tag}>{escape(line)}</{tag}>')
    return (
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">\n'
        '<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="ar" dir="rtl"><head><title>'
        + escape(title) + '</title><link rel="stylesheet" type="text/css" href="style.css"/></head><body>'
        f'<h1>{escape(title)}</h1>' + '\n'.join(body) + '</body></html>'
    )


def build(src, dst, title, author, uid):
    chapters = split_chapters(clean_pages(open(src, encoding='utf-8').read()))
    manifest = ['<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>',
                '<item id="css" href="style.css" media-type="text/css"/>']
    spine, navpoints = [], []
    for i, (label, _) in enumerate(chapters, 1):
        manifest.append(f'<item id="c{i}" href="c{i}.xhtml" media-type="application/xhtml+xml"/>')
        spine.append(f'<itemref idref="c{i}"/>')
        navpoints.append(
            f'<navPoint id="n{i}" playOrder="{i}"><navLabel><text>{escape(label)}</text></navLabel><content src="c{i}.xhtml"/></navPoint>')
    opf = (
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="uid">'
        '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">'
        f'<dc:title>{escape(title)}</dc:title><dc:creator opf:role="aut">{escape(author)}</dc:creator>'
        f'<dc:language>ar</dc:language><dc:identifier id="uid">{uid}</dc:identifier></metadata>'
        '<manifest>' + ''.join(manifest) + '</manifest>'
        '<spine toc="ncx" page-progression-direction="rtl">' + ''.join(spine) + '</spine></package>'
    )
    ncx = (
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><head>'
        f'<meta name="dtb:uid" content="{uid}"/></head><docTitle><text>{escape(title)}</text></docTitle>'
        '<navMap>' + ''.join(navpoints) + '</navMap></ncx>'
    )
    container = (
        '<?xml version="1.0"?>\n<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">'
        '<rootfiles><rootfile full-path="content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'
    )
    with zipfile.ZipFile(dst, 'w') as z:
        z.writestr(zipfile.ZipInfo('mimetype'), 'application/epub+zip', compress_type=zipfile.ZIP_STORED)
        z.writestr('META-INF/container.xml', container, compress_type=zipfile.ZIP_DEFLATED)
        z.writestr('content.opf', opf, compress_type=zipfile.ZIP_DEFLATED)
        z.writestr('toc.ncx', ncx, compress_type=zipfile.ZIP_DEFLATED)
        z.writestr('style.css', CSS, compress_type=zipfile.ZIP_DEFLATED)
        for i, (label, lines) in enumerate(chapters, 1):
            z.writestr(f'c{i}.xhtml', chapter_xhtml(label, lines), compress_type=zipfile.ZIP_DEFLATED)
    print(f'{len(chapters)} chapters, {sum(len(l) for _, l in chapters)} paragraphs -> {dst}')


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('src')
    ap.add_argument('dst')
    ap.add_argument('--title', required=True)
    ap.add_argument('--author', required=True)
    ap.add_argument('--uid', default=None)
    a = ap.parse_args()
    build(a.src, a.dst, a.title, a.author, a.uid or f'urn:uuid:{uuid.uuid4()}')
