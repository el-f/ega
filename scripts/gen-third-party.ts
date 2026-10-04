// MIT and ISC grant use only if their copyright notice ships, so the built extension needs this file.

import { readFile, writeFile, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'THIRD_PARTY.md');
const SCOWL_NOTICE = path.join(ROOT, 'scripts/english-lexicon/SCOWL-Copyright.txt');
const LICENSE_FILES = ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'LICENCE', 'license', 'COPYING'];
// dompurify offers a choice of two licenses; Apache-2.0 is the one Ega takes.
const ELECTED: Record<string, string> = {
  dompurify: 'Apache-2.0 (elected from "MPL-2.0 OR Apache-2.0")',
};
// Apache-2.0 §4 wants the holder's notice (DOMPurify's LICENSE names none) and a note that the copy was changed.
const NOTES: Record<string, (version: string) => string[]> = {
  dompurify: (version) => [
    'Copyright (c) Cure53 and other contributors',
    '',
    'The bundled copy is minified by Vite. The unmodified source is at',
    `https://github.com/cure53/DOMPurify/tree/${version}.`,
  ],
};

type Pkg = { name: string; version: string; license?: string; licenses?: unknown };

async function readPkg(dir: string): Promise<Pkg | null> {
  try {
    return JSON.parse(await readFile(path.join(dir, 'package.json'), 'utf8')) as Pkg;
  } catch {
    return null;
  }
}

// pnpm links every package to a real dir under .pnpm where its siblings live, so walk up from there.
async function resolveDir(name: string, from: string): Promise<string | null> {
  let dir = await realpath(from).catch(() => from);
  for (;;) {
    const candidate = path.join(dir, 'node_modules', ...name.split('/'));
    if ((await readPkg(candidate)) !== null) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

async function licenseText(dir: string): Promise<string> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return '';
  }
  const hit = entries.find(
    (e) => LICENSE_FILES.includes(e) || /^licen[cs]e/i.test(e) || /^copying/i.test(e),
  );
  if (!hit) return '';
  try {
    return (await readFile(path.join(dir, hit), 'utf8')).trim();
  } catch {
    return '';
  }
}

// A notice line starts with the word; a license body only mentions it, and the Apache appendix is a template.
function firstCopyright(text: string): string {
  const line = text
    .split('\n')
    .map((l) => l.trim())
    .find((l) => /^(?:Copyright|COPYRIGHT|©)\s/.test(l) && !l.includes('[yyyy]'));
  return line ?? '';
}

async function closure(): Promise<Map<string, { pkg: Pkg; dir: string }>> {
  const root = await readPkg(ROOT);
  if (!root) throw new Error('cannot read the root package.json');
  const runtime = Object.keys(
    (root as unknown as { dependencies?: Record<string, string> }).dependencies ?? {},
  );
  const seen = new Map<string, { pkg: Pkg; dir: string }>();
  const misses: string[] = [];
  const queue = runtime.map((name) => ({ name, from: ROOT }));
  while (queue.length > 0) {
    const item = queue.shift();
    if (item === undefined) continue;
    const dir = await resolveDir(item.name, item.from);
    if (dir === null) {
      misses.push(`${item.name} (from ${item.from})`);
      continue;
    }
    const pkg = await readPkg(dir);
    if (!pkg) continue;
    // Two versions of one package can both reach the bundle, so each needs its own notice.
    const key = `${item.name}@${pkg.version}`;
    if (seen.has(key)) continue;
    seen.set(key, { pkg, dir });
    const deps = (pkg as unknown as { dependencies?: Record<string, string> }).dependencies ?? {};
    queue.push(...Object.keys(deps).map((name) => ({ name, from: dir })));
  }
  // An unresolved package means its license notice silently drops out of the shipped file.
  if (misses.length > 0) {
    console.error('gen-third-party: cannot resolve:');
    for (const m of misses) console.error(`  ${m}`);
    process.exit(1);
  }
  return seen;
}

async function render(): Promise<string> {
  const found = await closure();
  const names = [...found.keys()].sort();
  const lines: string[] = [
    '# Third-party notices',
    '',
    "Every package in Ega's runtime dependency tree, with its license and first copyright line.",
    'Each stays under its own license. Ega itself is MIT — see LICENSE.',
    '',
    "The walk is wide on purpose. It follows `dependencies` transitively, so Svelte's own compiler",
    'packages (acorn, magic-string, zimmerframe, the `@types/*` entries) are listed even though only',
    'the runtime half reaches the built extension. Over-inclusion is the safe direction here.',
    '',
    'Regenerate with `pnpm gen:third-party`. `pnpm gen:third-party:check` re-renders the file and',
    'fails when it differs from the installed tree; it runs inside `pnpm verify`. There is no',
    'generation date on purpose — the check proves the file is current, and a date cannot.',
    '',
    '`pnpm zip` puts a copy inside the packaged extension. The native host has no dependencies, so',
    'it adds no notices of its own.',
    '',
    '## Extension icon',
    '',
    'The icons under `src/assets/icons/` are renders of the glyph ע set in Gveret Levin,',
    'Copyright 2024 The Gveret Levin Project Authors (https://github.com/AlefAlefAlef/gveret-levin),',
    'licensed under the SIL Open Font License 1.1. The font file and its license text sit in',
    '`scripts/icon-font/` (repository only; the packaged extension carries the rendered PNGs, not the',
    'font). Images made with an OFL font are not bound by the OFL.',
    '',
    '## English word list (SCOWL 2020.12.07)',
    '',
    "The smart bubble's English check reads `src/content/english-lexicon.txt`, built by",
    '`scripts/gen-english-lexicon.ts` from SCOWL (Spell Checker Oriented Word Lists),',
    'http://wordlist.aspell.net/. The full SCOWL copyright and permission notice follows.',
    '',
    '```',
    (await readFile(SCOWL_NOTICE, 'utf8')).trimEnd(),
    '```',
    '',
  ];
  for (const key of names) {
    const entry = found.get(key);
    if (entry === undefined) continue;
    const { pkg, dir } = entry;
    const name = pkg.name;
    const text = await licenseText(dir);
    const declared =
      pkg.license ??
      (typeof pkg.licenses === 'string'
        ? pkg.licenses
        : text !== ''
          ? 'not declared in package.json — see the text below'
          : 'NOT DECLARED, NO LICENSE TEXT FOUND');
    const lic = ELECTED[name] ?? declared;
    lines.push(`## ${name} ${pkg.version}`, '', `License: ${lic}`, '');
    const note = NOTES[name];
    const copyright = firstCopyright(text);
    if (note) lines.push(...note(pkg.version), '');
    else if (copyright !== '') lines.push(copyright, '');
    if (text !== '') lines.push('```', text, '```', '');
  }
  return lines.join('\n');
}

const out = await render();
if (process.argv.includes('--check')) {
  const current = await readFile(OUT, 'utf8').catch(() => '');
  if (current !== out) {
    console.error('THIRD_PARTY.md is out of date — run `pnpm gen:third-party`');
    process.exit(1);
  }
  console.log('gen-third-party: up to date.');
} else {
  await writeFile(OUT, out, 'utf8');
  console.log(`wrote THIRD_PARTY.md`);
}
