"""Extracts Al-Ṣiḥāḥ, Maqāyīs al-Lugha and Lane's Lexicon from the arabic_lexicons SQLite database
(https://github.com/wizsk/arabic_lexicons, GPL-3.0; the file is
assets/data/db/db.sqlite.zip in the repo) into the tab-separated format the
app's optional dictionaries read -- the same shape as public/alwasit-data:

    word<TAB>meanings

`word` is the root, `meanings` separates sub-entries with `<br>`.

Usage:  python scripts/extract-lexicon-data.py path/to/db.sqlite [--hanswehr | --hanswehr=OUT.tsv]

Lane's Lexicon (public domain) goes to public/lane-data/lane.tsv. Its table
(`lanelexcon`) is shaped differently: a row with is_root=1 is a root and its
sub-entries are the rows with parent_id = that root's id, in id order. Each
sub-entry holds HTML (<i>, <h>, <center>, a few tables, entities such as
&darr;), which is flattened here to plain text so the app never has to render
markup; one root becomes one line, sub-entries joined with `<br>`. Roots that
share a spelling are merged into one line, in id order.

--hanswehr also writes public/hanswehr-data/hanswehr.tsv from the `hanswehr`
table (grouped the same way; see extract_tree). Hans Wehr is UNDER COPYRIGHT:
that file is for your own machine only and must NEVER be committed -- the
repository holds an empty placeholder there. Without the flag the script does
not touch that file. --hanswehr=OUT.tsv writes only Hans Wehr, to OUT.tsv (for
example a folder outside the repository), and nothing else.

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


def extract_tree(db: sqlite3.Connection, table: str, out: Path, join_headless: bool = False) -> None:
    """Rows grouped by parent_id -> word<TAB>units, merged by root spelling.

    A root row (is_root=1) and its sub-entries share a parent_id. In Lane that
    is the root row's own id and the root row holds just the root (dropped); in Hans Wehr
    it is a separate number and the root row holds the verb's entry, which is
    kept as the first unit."""
    groups: dict[int, tuple[list[str], list[str]]] = {}
    for is_root, parent_id, word, meanings in db.execute(
        f"SELECT is_root, parent_id, word, meanings FROM {table} ORDER BY id"
    ):
        words, units = groups.setdefault(parent_id, ([], []))
        unit = clean_html(meanings or "")
        if is_root:
            words.append(one_line(word or ""))
            if " " not in unit:  # Lane's root rows only repeat the root (بأس)
                continue
        if unit:
            units.append(unit)
    merged: dict[str, list[str]] = {}
    roots = 0
    last_root = ""
    for words, units in groups.values():  # in order of first row id
        roots += len(words)
        if words and words[0]:
            last_root = words[0]
        # Hans Wehr splits شرق's article in two, the second half with no root
        # row, so there a headless group joins the root before it. Lane's few
        # headless rows are unrelated strays (شرس, نصب...) and are left out.
        root = words[0] if words and words[0] else (last_root if join_headless else "")
        if root and units:
            merged.setdefault(root, []).extend(units)
    lines = [f"{w}\t{'<br>'.join(u)}" for w, u in merged.items()]
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")
    print(f"{out.name}: {len(lines)} roots (of {roots} root rows), {out.stat().st_size:,} bytes")


def main() -> None:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    flags = [a for a in sys.argv[1:] if a.startswith("--")]
    hanswehr = [f for f in flags if f == "--hanswehr" or f.startswith("--hanswehr=")]
    if len(args) != 1 or len(hanswehr) != len(flags) or len(hanswehr) > 1:
        sys.exit(__doc__)
    db = sqlite3.connect(f"file:{args[0]}?mode=ro", uri=True)
    public = Path(__file__).resolve().parent.parent / "public"
    if hanswehr and "=" in hanswehr[0]:
        # Hans Wehr only, to a path of your choice (e.g. outside the repo).
        extract_tree(db, "hanswehr", Path(hanswehr[0].split("=", 1)[1]), join_headless=True)
        return
    extract_tree(db, "lanelexcon", public / "lane-data" / "lane.tsv")
    if hanswehr:
        extract_tree(db, "hanswehr", public / "hanswehr-data" / "hanswehr.tsv", join_headless=True)
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
