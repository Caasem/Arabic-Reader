// Stages a bundled dictionary as a pack folder, ready for scripts/packs/build.mjs.
//
//   node scripts/packs/stage-dictionary-pack.mjs alsihah <packs-folder>
//
// Writes <packs-folder>/alsihah/{pack.json, alsihah.tsv, SOURCE-README.md}, copied from public/alsihah-data. The
// licence block below is what that folder's SOURCE-README.md already records; the maintainer confirmed it is
// right on 2026-10-07 (the builder itself only checks that one is written down).
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const PACKS = {
  alsihah: {
    folder: 'alsihah-data',
    file: 'alsihah.tsv',
    version: 1,
    title: 'Al-Ṣiḥāḥ (الصحاح)',
    description: 'Al-Jawharī, al-Ṣiḥāḥ: Arabic-Arabic, filed by root (5,650 roots).',
    licence: {
      spdx: 'LicenseRef-public-domain-work-GPL-3.0-compilation',
      source: 'https://github.com/wizsk/arabic_lexicons (mujamul_shihah, tag v3.5.0)',
      attribution: 'Ismāʿīl al-Jawharī (d. c. 1002), text as compiled by the arabic_lexicons project',
    },
  },
};

const [id, outRoot] = process.argv.slice(2);
const pack = PACKS[id];
if (!pack || !outRoot) {
  console.error(`Usage: node scripts/packs/stage-dictionary-pack.mjs <${Object.keys(PACKS).join('|')}> <packs-folder>`);
  process.exit(1);
}
const source = resolve(import.meta.dirname, '..', '..', 'public', pack.folder);
if (!existsSync(join(source, pack.file))) {
  console.error(`${join(source, pack.file)} is missing.`);
  process.exit(1);
}
const dir = join(outRoot, id);
mkdirSync(dir, { recursive: true });
copyFileSync(join(source, pack.file), join(dir, pack.file));
if (existsSync(join(source, 'SOURCE-README.md'))) copyFileSync(join(source, 'SOURCE-README.md'), join(dir, 'SOURCE-README.md'));
writeFileSync(
  join(dir, 'pack.json'),
  JSON.stringify({ id, version: pack.version, title: pack.title, description: pack.description, kind: 'dictionary', licence: pack.licence }, null, 2) + '\n',
);
console.log(`Staged ${id} v${pack.version} in ${dir}.`);
