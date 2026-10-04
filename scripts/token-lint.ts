import { readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Contract: raw color literals — #hex AND rgb()/rgba()/hsl()/hsla()/oklch()/oklab()/color-mix() — belong in src/shared/tokens.css only; elsewhere use var(--color-*). Append the ALLOW_MARKER below in a CSS comment to skip one line. Hex fails the gate. Color functions fail too, except the frozen set in token-lint-baseline.json; `--update-baseline` only prunes entries that are gone, so the set can shrink and never grow.

// Non-global so .test() doesn't carry lastIndex between calls.
const HEX_RE = /#[0-9a-f]{3,8}\b/i;
const COLOR_FN_RE = /\b(?:rgba?|hsla?|oklch|oklab|color-mix)\(/i;
const COMMENT_RE_CSS = /\/\*[\s\S]*?\*\//g;
const COMMENT_RE_SVELTE_SCRIPT = /<script[^>]*>[\s\S]*?<\/script>/g;
const ALLOW_MARKER = 'token-lint-allow';

interface Violation {
  file: string;
  line: number;
  snippet: string;
  kind: 'hex' | 'fn';
}

function classify(line: string): Violation['kind'] | null {
  if (HEX_RE.test(line)) return 'hex';
  if (COLOR_FN_RE.test(line)) return 'fn';
  return null;
}

// Newlines survive so reported line numbers still match the original source.
function blankPreserveLines(s: string): string {
  return s.replace(/[^\n]/g, ' ');
}

function stripCssComments(input: string): string {
  return input.replace(COMMENT_RE_CSS, blankPreserveLines);
}

// Svelte markup comments — stripped so a `#abc` reference in one is not read as a color.
const COMMENT_RE_HTML = /<!--[\s\S]*?-->/g;
function stripHtmlComments(input: string): string {
  return input.replace(COMMENT_RE_HTML, blankPreserveLines);
}

function lintSvelte(source: string, file: string): Violation[] {
  // Script blocks hold no CSS, so blank them whole.
  const scriptsBlanked = source.replace(COMMENT_RE_SVELTE_SCRIPT, blankPreserveLines);
  const stripped = stripCssComments(stripHtmlComments(scriptsBlanked));
  const lines = stripped.split('\n');
  const origLines = source.split('\n');
  const out: Violation[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (origLines[i]?.includes(ALLOW_MARKER)) continue;
    const kind = classify(lines[i] ?? '');
    if (kind) out.push({ file, line: i + 1, snippet: (origLines[i] ?? '').trim(), kind });
  }
  return out;
}

function lintCss(source: string, file: string): Violation[] {
  const stripped = stripCssComments(source);
  const strippedLines = stripped.split('\n');
  const origLines = source.split('\n');
  const out: Violation[] = [];
  for (let i = 0; i < strippedLines.length; i++) {
    if (origLines[i]?.includes(ALLOW_MARKER)) continue;
    const kind = classify(strippedLines[i] ?? '');
    if (kind) out.push({ file, line: i + 1, snippet: (origLines[i] ?? '').trim(), kind });
  }
  return out;
}

async function walk(dir: string, exts: string[], out: string[]): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      await walk(p, exts, out);
    } else if (e.isFile() && exts.some((x) => e.name.endsWith(x))) {
      out.push(p);
    }
  }
}

async function main(): Promise<void> {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const root = path.resolve(here, '..');
  const srcDir = path.join(root, 'src');

  const files: string[] = [];
  await walk(srcDir, ['.svelte', '.css'], files);

  const violations: Violation[] = [];
  for (const abs of files) {
    const rel = path.relative(root, abs).replace(/\\/g, '/');
    // Tokens file is the single source of truth — literals are allowed there.
    if (rel.endsWith('shared/tokens.css')) continue;
    const source = await readFile(abs, 'utf8');
    const found = abs.endsWith('.svelte') ? lintSvelte(source, rel) : lintCss(source, rel);
    violations.push(...found);
  }

  const hex = violations.filter((v) => v.kind === 'hex');
  const fns = violations.filter((v) => v.kind === 'fn');

  // Keyed on file + snippet, not line, so an unrelated edit above a frozen literal does not move it.
  const baselinePath = path.join(here, 'token-lint-baseline.json');
  const baseline = new Set<string>(JSON.parse(await readFile(baselinePath, 'utf8')) as string[]);
  const fnKey = (v: Violation): string => `${v.file}  ${v.snippet}`;
  const present = new Set(fns.map(fnKey));
  const fresh = fns.filter((v) => !baseline.has(fnKey(v)));
  const gone = [...baseline].filter((k) => !present.has(k));

  if (process.argv.includes('--update-baseline')) {
    const pruned = [...baseline].filter((k) => present.has(k)).sort();
    await writeFile(baselinePath, JSON.stringify(pruned, null, 2) + '\n', 'utf8');
    console.log(`token-lint: baseline pruned to ${pruned.length} entries (${gone.length} removed)`);
  } else if (gone.length > 0) {
    console.error(
      '✗ Token-lint: baseline entries no longer in source — run `pnpm lint:tokens --update-baseline`:',
    );
    for (const k of gone) console.error(`  ${k}`);
    process.exit(1);
  }

  if (fresh.length > 0) {
    console.error(
      '✗ Token-lint: new color-function literal(s) outside tokens.css (use a token or add `/* token-lint-allow */`):',
    );
    for (const v of fresh) console.error(`  ${v.file}:${v.line}  ${v.snippet}`);
    process.exit(1);
  }

  if (hex.length > 0) {
    console.error(
      '✗ Token-lint: raw #hex literals found (use var(--color-*) or add `/* token-lint-allow */`):',
    );
    for (const v of hex) console.error(`  ${v.file}:${v.line}  ${v.snippet}`);
    process.exit(1);
  }
  console.log(
    `✓ Token-lint OK (${files.length} files scanned, ${present.size} frozen color literals)`,
  );
}

const invokedDirectly =
  !!process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (invokedDirectly) void main();

export { lintSvelte, lintCss };
