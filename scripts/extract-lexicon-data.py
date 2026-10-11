"""Extracts Al-Ṣiḥāḥ, Maqāyīs al-Lugha and Lane's Lexicon from the arabic_lexicons SQLite database
(https://github.com/wizsk/arabic_lexicons, GPL-3.0; the file is
assets/data/db/db.sqlite.zip in the repo) into the tab-separated format the
app's optional dictionaries read -- the same shape as public/alwasit-data:

    word<TAB>meanings

`word` is the root, `meanings` separates sub-entries with `<br>`.

Usage:  python scripts/extract-lexicon-data.py path/to/db.sqlite [--hanswehr]

Lane's Lexicon (public domain) goes to public/lane-data/lane.tsv. Its table
(`lanelexcon`) is shaped differently: a row with is_root=1 is a root and its
sub-entries are the rows with parent_id = that root's id, in id order. Each
sub-entry holds HTML (<i>, <h>, <center>, a few tables, entities such as
&darr;), which is flattened here to plain text so the app never has to render
markup; one root becomes one line, sub-entries joined with `<br>`. Roots that
share a spelling are merged into one line, in id order.

--hanswehr also writes public/hanswehr-data/hanswehr.tsv from the `hanswehr`
table (same shape as Lane). Hans Wehr is UNDER COPYRIGHT: that file is for your
own machine only and must NEVER be committed -- the repository holds an empty
placeholder there. Without the flag the script does not touch that file.

Differences from the raw tables (verified against the full data):
  * `|` marks a new line/paragraph in the source; it becomes `<br>`. Empty
    units (300 Maqāyīs articles, 6 Ṣiḥāḥ ones) are dropped.
  * Ṣiḥāḥ carries editor's notes as `[[...]]` (8,323 of them, in 3,313 of 5,650
    articles) and some contain `|` themselves, so they are lifted out *before*
    splitting. Each becomes a numbered marker "(١)" in the text, and the notes
    follow as the article's last sub-entries -- the same treatment the
    arabic_lexicons app gives them.
"""
import html
import re
import sqlite3
import sys
from pathlib import Path

TABLES = {
    "alsihah-data/alsihah.tsv": "mujamul_shihah",
    "almaqayis-data/almaqayis.tsv": "maqayeesul_luga",
}

NOTE_RE = re.compile(r"\[\[(.*?)\]\]", re.S)
ARABIC_DIGITS = str.maketrans("0123456789", "٠١٢٣٤٥٦٧٨٩")


def one_line(text: str) -> str:
    return re.sub(r"[\t\r\n]+", " ", text).strip()


def to_units(meanings: str) -> list[str]:
    notes: list[str] = []

    def lift(match: re.Match) -> str:
        notes.append(one_line(match.group(1).replace("|", " ")))
        return f"({len(notes)})".translate(ARABIC_DIGITS)

    body = NOTE_RE.sub(lift, meanings)
    units = [one_line(u) for u in body.split("|")]
    units = [u for u in units if u]
    units += [f"({i})".translate(ARABIC_DIGITS) + " " + n for i, n in enumerate(notes, 1)]
    return units


TAG_RE = re.compile(r"<[^>]*>")


def clean_html(text: str) -> str:
    """HTML sub-entry -> one line of plain text (tags dropped, entities decoded)."""
    text = re.sub(r"<(?:br|/tr|/td|/th)[ /]*>", " ", text, flags=re.I)
    text = html.unescape(TAG_RE.sub("", text))
    return re.sub(r"\s+", " ", text).strip()


def extract_tree(db: sqlite3.Connection, table: str, out: Path) -> None:
    """Root rows (is_root=1) with their children (parent_id) -> word<TAB>units, merged by root spelling."""
    children: dict[int, list[str]] = {}
    roots: list[tuple[int, str]] = []
    for id_, is_root, parent_id, word, meanings in db.execute(
        f"SELECT id, is_root, parent_id, word, meanings FROM {table} ORDER BY id"
    ):
        if is_root:
            roots.append((id_, one_line(word or "")))
        else:
            unit = clean_html(meanings or "")
            if unit:
                children.setdefault(parent_id, []).append(unit)
    merged: dict[str, list[str]] = {}
    for id_, word in roots:
        units = children.get(id_, [])
        if word and units:
            merged.setdefault(word, []).extend(units)
    lines = [f"{w}\t{'<br>'.join(u)}" for w, u in merged.items()]
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")
    print(f"{out.name}: {len(lines)} roots (of {len(roots)} root rows), {out.stat().st_size:,} bytes")


def main() -> None:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    flags = [a for a in sys.argv[1:] if a.startswith("--")]
    if len(args) != 1 or any(f != "--hanswehr" for f in flags):
        sys.exit(__doc__)
    db = sqlite3.connect(f"file:{args[0]}?mode=ro", uri=True)
    public = Path(__file__).resolve().parent.parent / "public"
    extract_tree(db, "lanelexcon", public / "lane-data" / "lane.tsv")
    if "--hanswehr" in flags:
        extract_tree(db, "hanswehr", public / "hanswehr-data" / "hanswehr.tsv")
        print("\n*** WARNING: Hans Wehr is under copyright. public/hanswehr-data/hanswehr.tsv now holds the real")
        print("*** text. Use it locally only. NEVER commit it (git checkout -- that file before committing)."+"\n")
    for rel, table in TABLES.items():
        out = public / rel
        out.parent.mkdir(parents=True, exist_ok=True)
        rows = db.execute(f"SELECT word, meanings FROM {table} ORDER BY id").fetchall()
        lines = []
        for word, meanings in rows:
            word = one_line(word or "")
            units = to_units(meanings or "")
            if not word or not units:
                continue
            lines.append(f"{word}\t{'<br>'.join(units)}")
        out.write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")
        print(f"{rel}: {len(lines)} rows (of {len(rows)}), {out.stat().st_size:,} bytes")


if __name__ == "__main__":
    main()
