// Checks a pack repository the way an app would: signature, then every file's size and SHA-256.
//
//   node scripts/packs/verify.mjs <repository-folder> --public-key <base64url> [--public-key <spare>]
import { verifyRepository } from './lib.mjs';

const args = process.argv.slice(2);
const dir = args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
const keys = args.flatMap((a, i) => (a === '--public-key' ? [args[i + 1]] : []));
if (!dir || keys.length === 0) {
  console.error('Usage: node scripts/packs/verify.mjs <repository-folder> --public-key <base64url> [--public-key <spare>]');
  process.exit(1);
}
const problems = await verifyRepository({ dir, trustedKeys: keys });
if (problems.length) {
  console.error(problems.map((p) => `  ${p}`).join('\n'));
  process.exit(1);
}
console.log('Signature and every file verify.');
