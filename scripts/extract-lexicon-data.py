"""Extracts Al-Ṣiḥāḥ and Maqāyīs al-Lugha from the arabic_lexicons SQLite database
(https://github.com/wizsk/arabic_lexicons, GPL-3.0; the file is
assets/data/db/db.sqlite.zip in the repo) into the tab-separated format the
app's optional dictionaries read -- the same shape as public/alwasit-data:

    word<TAB>meanings

`word` is the root, `meanings` separates sub-entries with `<br>`.

Usage:  python scripts/extract-lexicon-data.py path/to/db.sqlite

Differences from the raw tables (verified against the full data):
  * `|` marks a new line/paragraph in the source; it becomes `<br>`. Empty
    units (300 Maqāyīs articles, 6 Ṣiḥāḥ ones) are dropped.
  * Ṣiḥāḥ carries editor's notes as `[[...]]` (8,323 of them, in 3,313 of 5,650
    articles) and some contain `|` themselves, so they are lifted out *before*
    splitting. Each becomes a numbered marker "(١)" in the text, and the notes
    follow as the article's last sub-entries -- the same treatment the
    arabic_lexicons app gives them.
"""
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


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    db = sqlite3.connect(f"file:{sys.argv[1]}?mode=ro", uri=True)
    public = Path(__file__).resolve().parent.parent / "public"
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
