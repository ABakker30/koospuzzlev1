// i18n-sync.ts — key-parity report: every locale vs en/common.json.
//   npx tsx scripts/i18n-sync.ts            # summary for all languages
//   npx tsx scripts/i18n-sync.ts de         # exact missing/orphan lists
// Exit code 1 if any language has missing keys or orphans (CI-friendly).

import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const LOCALES = resolve(__dir, '../src/i18n/locales');

function flatten(obj: any, prefix = ''): string[] {
  const keys: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) keys.push(...flatten(v, path));
    else keys.push(path);
  }
  return keys;
}

const en = new Set(
  flatten(JSON.parse(readFileSync(resolve(LOCALES, 'en/common.json'), 'utf-8')))
);
const only = process.argv[2];
let dirty = false;

for (const lang of readdirSync(LOCALES).sort()) {
  if (lang === 'en') continue;
  if (only && lang !== only) continue;
  const file = resolve(LOCALES, lang, 'common.json');
  let keys: Set<string>;
  try {
    keys = new Set(flatten(JSON.parse(readFileSync(file, 'utf-8'))));
  } catch (e) {
    console.log(`${lang}: INVALID JSON — ${(e as Error).message}`);
    dirty = true;
    continue;
  }
  const missing = [...en].filter((k) => !keys.has(k));
  const orphans = [...keys].filter((k) => !en.has(k));
  console.log(`${lang}: ${keys.size} keys, missing ${missing.length}, orphans ${orphans.length}`);
  if (only) {
    if (missing.length) console.log('MISSING:\n  ' + missing.join('\n  '));
    if (orphans.length) console.log('ORPHANS:\n  ' + orphans.join('\n  '));
  }
  if (missing.length || orphans.length) dirty = true;
}
process.exit(dirty ? 1 : 0);
