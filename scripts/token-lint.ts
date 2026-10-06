import { readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Contract: font sizes come from the type scale — a `font-size` is var(--fs-*), a custom property that falls back to one, or inherit/unset (initial, revert and revert-layer compute to a browser default, off the scale); a `font` shorthand carries no literal size; a custom property some font-size reads is assigned only scale values. Checked in <style>, style attributes and style: directives, and in style writes from .ts and <script> code. The same ALLOW_MARKER skips one declaration (page-DOM text sized in em on purpose).
// Contract: raw color literals — #hex AND rgb()/rgba()/hsl()/hsla()/oklch()/oklab()/color-mix() — belong in src/shared/tokens.css only; elsewhere use var(--color-*). Append the ALLOW_MARKER below in a CSS comment to skip one line. Hex fails the gate. Color functions fail too, except the frozen set in token-lint-baseline.json; `--update-baseline` only prunes entries that are gone, so the set can shrink and never grow.

// Non-global so .test() doesn't carry lastIndex between calls.
const HEX_RE = /#[0-9a-f]{3,8}\b/i;
const COLOR_FN_RE = /\b(?:rgba?|hsla?|oklch|oklab|color-mix)\(/i;
const COMMENT_RE_CSS = /\/\*[\s\S]*?\*\//g;
const COMMENT_RE_SVELTE_SCRIPT = /<script[^>]*>[\s\S]*?<\/script>/g;
const STYLE_BLOCK_RE = /<style[^>]*>[\s\S]*?<\/style>/g;
const ALLOW_MARKER = 'token-lint-allow';

interface Violation {
  file: string;
  line: number;
  snippet: string;
  kind: 'hex' | 'fn' | 'font';
}

// A declaration starts after a CSS separator, a quote (style='…') or a backtick (style={`…`}).
const DECL_START = String.raw`(?:^|[\s;{"'\x60])`;
// The value ends at the end of the declaration, the attribute or the template literal.
const DECL_VALUE = String.raw`\s*:\s*([^;}"'\x60]*)`;
const FONT_SIZE_RE = new RegExp(`${DECL_START}font-size${DECL_VALUE}`, 'gi');
const FONT_SHORTHAND_RE = new RegExp(`${DECL_START}font${DECL_VALUE}`, 'gi');
const CUSTOM_PROP_RE = new RegExp(`${DECL_START}(--[\\w-]+)${DECL_VALUE}`, 'g');
// style:font-size="…" / style:--x={…}: quoted value or a {expression}.
const DIRECTIVE_RE =
  /\bstyle:(font-size|--[\w-]+)(?:\|important)?\s*=\s*(?:"([^"]*)"|'([^']*)'|\{([^}]*)\})/g;
// el.style.fontSize = …; el.style.setProperty('font-size' | '--x', …).
const TS_FONT_SIZE_RE = /\.fontSize\s*=\s*([^;]+)/g;
const TS_SET_PROPERTY_RE = /\.setProperty\(\s*['"\x60](font-size|--[\w-]+)['"\x60]\s*,\s*([^,)]+)/g;
// A declaration whose value prettier moved to the next lines.
const OPEN_DECL_RE = /(?:^|[\s;{])(?:font|font-size|--[\w-]+)\s*:\s*$/;
const SCALE_VALUE_RE =
  /^(?:inherit|unset|var\(--fs-[\w-]+\)|var\(--[\w-]+,\s*var\(--fs-[\w-]+\)\))(?:\s*!important)?$/;
const LITERAL_SIZE_RE =
  /\d(?:px|em|rem|pt|pc|%|vw|vh|vi|vb|vmin|vmax|ch|ex|cap|ic|lh|rlh|q|cm|mm|in)(?![\w-])|(?<![\w-])(?:xx-small|x-small|small|medium|large|x-large|xx-large|xxx-large|smaller|larger)(?![\w-])/i;
const STRING_LITERAL_RE = /^(['"\x60])([^'"\x60$]*)\1$/;

function onScale(value: string): boolean {
  return SCALE_VALUE_RE.test(value.trim());
}

// A code expression passes only when it is a plain string literal holding a scale value.
function exprOnScale(expr: string): boolean {
  const lit = STRING_LITERAL_RE.exec(expr.trim());
  return lit !== null && onScale(lit[2] ?? '');
}

/** Custom properties a font-size reads (`font-size: var(--x, …)`): a literal assigned to one is an off-scale size. */
function fontSizeFeeds(source: string): Set<string> {
  const out = new Set<string>();
  for (const m of source.matchAll(FONT_SIZE_RE)) {
    for (const v of (m[1] ?? '').matchAll(/var\(\s*(--[\w-]+)/g)) if (v[1]) out.add(v[1]);
  }
  return out;
}

function feeds(name: string, fed: ReadonlySet<string>): boolean {
  return name.startsWith('--fs-') || fed.has(name);
}

function offScale(line: string, fed: ReadonlySet<string>): boolean {
  for (const m of line.matchAll(FONT_SIZE_RE)) {
    const v = (m[1] ?? '').trim();
    if (v !== '' && !onScale(v)) return true;
  }
  for (const m of line.matchAll(FONT_SHORTHAND_RE))
    if (LITERAL_SIZE_RE.test(m[1] ?? '')) return true;
  for (const m of line.matchAll(CUSTOM_PROP_RE)) {
    const v = (m[2] ?? '').trim();
    if (v !== '' && feeds(m[1] ?? '', fed) && !onScale(v)) return true;
  }
  for (const m of line.matchAll(DIRECTIVE_RE)) {
    const name = m[1] ?? '';
    if (name !== 'font-size' && !feeds(name, fed)) continue;
    const quoted = m[2] ?? m[3];
    if (quoted !== undefined ? !onScale(quoted) : !exprOnScale(m[4] ?? '')) return true;
  }
  return codeOffScale(line, fed);
}

// Style writes from code: element.style in a .ts file or a Svelte <script>.
function codeOffScale(line: string, fed: ReadonlySet<string>): boolean {
  for (const m of line.matchAll(TS_FONT_SIZE_RE)) if (!exprOnScale(m[1] ?? '')) return true;
  for (const m of line.matchAll(TS_SET_PROPERTY_RE)) {
    const name = m[1] ?? '';
    if ((name === 'font-size' || feeds(name, fed)) && !exprOnScale(m[2] ?? '')) return true;
  }
  return false;
}

function classify(line: string, fed: ReadonlySet<string>): Violation['kind'] | null {
  if (HEX_RE.test(line)) return 'hex';
  if (COLOR_FN_RE.test(line)) return 'fn';
  if (offScale(line, fed)) return 'font';
  return null;
}

/** Line i, plus the following lines when its declaration value continues there (prettier wraps long `font:`). */
function declarationAt(lines: readonly string[], i: number): { text: string; last: number } {
  let text = lines[i] ?? '';
  let last = i;
  if (!OPEN_DECL_RE.test(text)) return { text, last };
  while (last + 1 < lines.length && !/[;}]/.test(lines[last] ?? '')) {
    last++;
    text += ' ' + (lines[last] ?? '').trim();
  }
  return { text, last };
}

function lintLines(
  lines: readonly string[],
  origLines: readonly string[],
  file: string,
  check: (text: string) => Violation['kind'] | null,
): Violation[] {
  const out: Violation[] = [];
  for (let i = 0; i < lines.length; i++) {
    const { text, last } = declarationAt(lines, i);
    if (origLines.slice(i, last + 1).some((l) => l.includes(ALLOW_MARKER))) continue;
    const kind = check(text);
    if (kind) out.push({ file, line: i + 1, snippet: (origLines[i] ?? '').trim(), kind });
  }
  return out;
}

// Strings come first, so a `/*` or `//` inside one (`'image/*'`, `chrome-extension://*`) never opens a comment. A nested template literal or a regex literal holding a quote can still fool it.
const CODE_TOKEN_RE =
  /'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|\x60(?:\\[\s\S]|[^\x60\\])*\x60|\/\*[\s\S]*?\*\/|(?<![:\\])\/\/[^\n]*/g;

// `//` and `/* */` comments in code, blanked so a commented-out style write is not flagged.
function stripCodeComments(input: string): string {
  return input.replace(CODE_TOKEN_RE, (m) => (m.startsWith('/') ? blankPreserveLines(m) : m));
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

/**
 * `fed`: custom properties some font-size reads, across the whole tree. Defaults to the ones this file reads,
 * which is all a single-file check can know.
 */
function lintSvelte(source: string, file: string, fed = fontSizeFeeds(source)): Violation[] {
  const origLines = source.split('\n');
  // Markup and <style>: colors and sizes. A <script> is blanked here; only <style> holds /* */ comments (`accept="image/*"` is a value).
  const scriptsBlanked = source.replace(COMMENT_RE_SVELTE_SCRIPT, blankPreserveLines);
  const markup = stripHtmlComments(scriptsBlanked)
    .replace(STYLE_BLOCK_RE, stripCssComments)
    .split('\n');
  const out = lintLines(markup, origLines, file, (t) => classify(t, fed));
  // The <script> alone: style writes from code and style strings.
  let scriptOnly = blankPreserveLines(source);
  for (const m of source.matchAll(COMMENT_RE_SVELTE_SCRIPT)) {
    const at = m.index;
    scriptOnly = scriptOnly.slice(0, at) + m[0] + scriptOnly.slice(at + m[0].length);
  }
  out.push(...lintCode(stripCodeComments(scriptOnly).split('\n'), origLines, file, fed));
  return out.sort((a, b) => a.line - b.line);
}

function lintCss(source: string, file: string, fed = fontSizeFeeds(source)): Violation[] {
  const lines = stripCssComments(source).split('\n');
  return lintLines(lines, source.split('\n'), file, (t) => classify(t, fed));
}

function lintCode(
  lines: readonly string[],
  origLines: readonly string[],
  file: string,
  fed: ReadonlySet<string>,
): Violation[] {
  return lintLines(lines, origLines, file, (t) => (offScale(t, fed) ? 'font' : null));
}

/** A .ts file: only font sizes. A `#` in code is an id or a selector far more often than a color. */
function lintTs(source: string, file: string, fed = fontSizeFeeds(source)): Violation[] {
  return lintCode(stripCodeComments(source).split('\n'), source.split('\n'), file, fed);
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
  await walk(srcDir, ['.svelte', '.css', '.ts'], files);

  const sources = new Map<string, string>();
  for (const abs of files) {
    const rel = path.relative(root, abs).replace(/\\/g, '/');
    // Tokens file is the single source of truth — literals are allowed there.
    if (rel.endsWith('shared/tokens.css') || rel.endsWith('.d.ts')) continue;
    sources.set(rel, await readFile(abs, 'utf8'));
  }
  // A custom property declared in one file can feed a font-size in another (--ega-md-fs).
  const fed = new Set<string>();
  for (const source of sources.values()) for (const name of fontSizeFeeds(source)) fed.add(name);

  const violations: Violation[] = [];
  for (const [rel, source] of sources) {
    const lint = rel.endsWith('.svelte') ? lintSvelte : rel.endsWith('.ts') ? lintTs : lintCss;
    violations.push(...lint(source, rel, fed));
  }

  const hex = violations.filter((v) => v.kind === 'hex');
  const fonts = violations.filter((v) => v.kind === 'font');
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
  if (fonts.length > 0) {
    console.error(
      '✗ Token-lint: font size outside the type scale (use var(--fs-*) or inherit, or add `/* token-lint-allow */`):',
    );
    for (const v of fonts) console.error(`  ${v.file}:${v.line}  ${v.snippet}`);
    process.exit(1);
  }
  console.log(
    `✓ Token-lint OK (${files.length} files scanned, ${present.size} frozen color literals)`,
  );
}

const invokedDirectly =
  !!process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (invokedDirectly) void main();

export { lintSvelte, lintCss, lintTs };
