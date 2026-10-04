import { readFile, readdir, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// A component `<style>` compiles to a page-document asset that never crosses the shadow boundary; src/content/shadow.css is the sheet shadowHost.ts injects. Imports are followed transitively, so a shared component mounted into the shadow root is checked too.

const ALLOW_MARKER = 'shadow-css-lint-allow';
const ALLOW_CLASSES_RE = /shadow-css-lint-allow:\s*([^*\n]+)/g;

/** `shadow-css-lint-allow: a, b` exempts only those classes; a bare marker exempts the whole file. */
export function allowedClasses(source: string): Set<string> {
  const out = new Set<string>();
  for (const m of source.matchAll(ALLOW_CLASSES_RE)) {
    // Only the leading run of comma-separated names counts, so a reason — even one with a comma — is never read as a class.
    const run = /^\s*\.?(?:[a-z_-][\w-]*\s*,\s*\.?)*[a-z_-][\w-]*/i.exec(m[1] ?? '')?.[0];
    if (run === undefined) continue;
    for (const name of run.split(',')) {
      const id = name.trim().replace(/^\./, '');
      if (id.length > 0) out.add(id);
    }
  }
  return out;
}

async function walk(dir: string, out: string[]): Promise<void> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(abs, out);
    else if (entry.name.endsWith('.svelte')) out.push(abs);
  }
}

const IMPORT_RE = /(?:from|import)\s*(?:\(\s*)?['"]([^'"]+\.svelte)['"]/g;

/** `@/x` → `<root>/src/x`; `./x` and `../x` resolve against the importer. Anything else is external. */
function resolveSpecifier(spec: string, importerDir: string, root: string): string | null {
  if (spec.startsWith('@/')) return path.join(root, 'src', spec.slice(2));
  if (spec.startsWith('./') || spec.startsWith('../')) return path.resolve(importerDir, spec);
  return null;
}

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

/** Every .svelte file reachable from the entry set, including the entries themselves. */
async function collectReachable(entries: string[], root: string): Promise<string[]> {
  const seen = new Set<string>();
  const queue = [...entries];
  while (queue.length > 0) {
    const abs = queue.pop();
    if (abs === undefined || seen.has(abs)) continue;
    seen.add(abs);
    const source = await readFile(abs, 'utf8');
    const dir = path.dirname(abs);
    for (const m of source.matchAll(IMPORT_RE)) {
      const spec = m[1];
      if (spec === undefined) continue;
      const resolved = resolveSpecifier(spec, dir, root);
      if (resolved === null || seen.has(resolved)) continue;
      if (await exists(resolved)) queue.push(resolved);
    }
  }
  return [...seen];
}

function styleBlock(source: string): string | null {
  const open = source.search(/^<style/m);
  if (open === -1) return null;
  const close = source.indexOf('</style>', open);
  return source.slice(source.indexOf('>', open) + 1, close === -1 ? undefined : close);
}

/** Class selectors only — comments and quoted values are stripped so `url("…w3.org…")` and prose do not count. */
export function classSelectors(css: string): string[] {
  const cleaned = css
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/"(?:[^"\\]|\\.)*"/g, ' ')
    .replace(/'(?:[^'\\]|\\.)*'/g, ' ');
  return [...new Set([...cleaned.matchAll(/\.(-?[a-z_][\w-]*)/gi)].map((m) => m[1] as string))];
}

function escapeClass(className: string): string {
  return className.replace(/[-[\]{}()*+?.,\\^$|#]/g, '\\$&');
}

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, ' ');
}

/** Splits on `sep` outside quotes and parentheses, so `:not(.a, .b)` and a data-URI `;` stay whole. */
function splitTop(text: string, sep: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote !== null) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === sep && depth === 0) {
      out.push(text.slice(start, i));
      start = i + 1;
    }
  }
  out.push(text.slice(start));
  return out.map((s) => s.trim()).filter((s) => s.length > 0);
}

/** `:global(x)` unwrapped, one quote style, one space around combinators — so a component selector and its sheet copy compare equal. */
function normalizeSelector(selector: string): string {
  let out = selector;
  for (let prev = ''; prev !== out;) {
    prev = out;
    out = out.replace(/:global\(((?:[^()]|\([^()]*\))*)\)/g, '$1');
  }
  return out
    .replace(/"/g, "'")
    .replace(/\s*([>+~])\s*/g, ' $1 ')
    .replace(/\s+/g, ' ')
    .trim();
}

interface CssRule {
  /** Enclosing at-rule preludes, e.g. `@media (forced-colors: active)`; empty at top level. */
  context: string;
  selectors: string[];
  decls: Map<string, string>;
}

/** Style rules with their at-rule context. Braces and `;` inside quotes do not count. */
export function parseRules(css: string): CssRule[] {
  const src = stripComments(css);
  const out: CssRule[] = [];
  const preludes: string[] = [];
  let buf = '';
  let quote: string | null = null;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i] as string;
    if (quote !== null) {
      buf += ch;
      if (ch === '\\') buf += src[++i] ?? '';
      else if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      buf += ch;
    } else if (ch === '{') {
      preludes.push(
        buf
          .slice(buf.lastIndexOf(';') + 1)
          .trim()
          .replace(/\s+/g, ' '),
      );
      buf = '';
    } else if (ch === '}') {
      const prelude = preludes.pop() ?? '';
      if (!prelude.startsWith('@')) {
        const decls = new Map<string, string>();
        for (const decl of splitTop(buf, ';')) {
          const colon = decl.indexOf(':');
          if (colon === -1) continue;
          decls.set(
            decl.slice(0, colon).trim(),
            decl
              .slice(colon + 1)
              .trim()
              .replace(/\s+/g, ' '),
          );
        }
        const context = preludes.filter((p) => p.startsWith('@')).join(' ');
        const selectors = splitTop(prelude, ',').map(normalizeSelector);
        if (selectors.length > 0) out.push({ context, selectors, decls });
      }
      buf = '';
    } else buf += ch;
  }
  return out;
}

/** The class must be in a real rule's selector, outside :not(); a comment, a value or a longer class name does not count. */
export function sheetDeclares(sheet: string, className: string): boolean {
  const hit = new RegExp(`\\.${escapeClass(className)}(?![\\w-])`);
  return parseRules(sheet).some((rule) =>
    rule.selectors.some((sel) => hit.test(sel.replace(/:not\([^)]*\)/g, ''))),
  );
}

/**
 * Where the sheet's copy of a component's rules differs from the component. A component rule is mirrored
 * when the sheet has the same selector, alone or under one of the component's own single-class rules
 * (`.root .x`), in the same at-rule. Extra declarations in a copy are allowed: they reset host-page
 * defaults inside the shadow root. A sheet rule that starts with a root class but mirrors no component
 * rule is a stale copy.
 */
export function mirrorDrift(componentCss: string, sheet: string): string[] {
  const own = parseRules(componentCss);
  const copies = parseRules(sheet);
  const ownSelectors = new Set(own.flatMap((r) => r.selectors));
  const roots = [...ownSelectors].filter((s) => /^\.[\w-]+$/.test(s));
  const out: string[] = [];
  for (const sel of copies.flatMap((c) => c.selectors)) {
    const root = /^\.[\w-]+/.exec(sel)?.[0];
    if (root === undefined || !roots.includes(root) || ownSelectors.has(sel)) continue;
    if (sel.startsWith(`${root} `) && ownSelectors.has(sel.slice(root.length + 1))) continue;
    out.push(`${sel} — in the sheet, not in the component`);
  }
  for (const rule of own) {
    for (const sel of rule.selectors) {
      const forms = new Set([sel, ...roots.filter((r) => r !== sel).map((r) => `${r} ${sel}`)]);
      const matched = copies.filter(
        (c) => c.context === rule.context && c.selectors.some((s) => forms.has(s)),
      );
      if (matched.length === 0) continue;
      const sheetDecls = new Map(matched.flatMap((c) => [...c.decls]));
      for (const [prop, value] of rule.decls) {
        const got = sheetDecls.get(prop);
        if (got !== value) out.push(`${sel} { ${prop}: ${value} } — sheet has ${got ?? 'none'}`);
      }
    }
  }
  return out;
}

const CSS_IMPORT_RE = /@import\s+(?:url\(\s*)?['"]([^'"]+)['"][\s)]*;/g;

/** Vite inlines `@import` into the sheet shadowHost.ts injects, so the lint has to read it the same way — tokens.css rules DO reach the shadow root. */
export async function readSheet(abs: string): Promise<string> {
  const source = await readFile(abs, 'utf8');
  const dir = path.dirname(abs);
  const parts: string[] = [];
  let cursor = 0;
  for (const m of source.matchAll(CSS_IMPORT_RE)) {
    const spec = m[1];
    if (spec === undefined || spec.startsWith('http') || spec.startsWith('url(')) continue;
    parts.push(source.slice(cursor, m.index));
    cursor = m.index + m[0].length;
    parts.push(await readSheet(path.resolve(dir, spec)));
  }
  parts.push(source.slice(cursor));
  return parts.join('\n');
}

/** Static `class="a b"` and `class:a` names on the markup side of a component, `ega-`-prefixed only. */
export function markupClasses(source: string): string[] {
  const markup = source
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ');
  const out = new Set<string>();
  for (const m of markup.matchAll(/\bclass=(?:"([^"]*)"|'([^']*)')/g)) {
    for (const name of (m[1] ?? m[2] ?? '').split(/\s+/)) {
      if (/^ega-[\w-]+$/.test(name)) out.add(name);
    }
  }
  for (const m of markup.matchAll(/\bclass:(ega-[\w-]+)/g)) out.add(m[1] as string);
  return [...out];
}

async function main(): Promise<void> {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const contentDir = path.join(root, 'src', 'content');
  const entries: string[] = [];
  await walk(contentDir, entries);
  const files = await collectReachable(entries, root);
  const shadowSheet = await readSheet(path.join(contentDir, 'shadow.css'));
  // multi-select.ts and batch-progress.ts inject their own sheets into the same root; page-styles.css goes to document.head instead.
  const rootSheets =
    shadowSheet +
    '\n' +
    (await readSheet(path.join(contentDir, 'page-translate-v2', 'multi-select.css'))) +
    '\n' +
    (await readSheet(path.join(contentDir, 'batch-progress.css')));

  const inContentDir: string[] = [];
  const unportedShared: { file: string; classes: string[] }[] = [];
  const unstyledMarkup: { file: string; classes: string[] }[] = [];
  const driftedCopies: { file: string; lines: string[] }[] = [];

  for (const abs of files) {
    const source = await readFile(abs, 'utf8');
    const exempt = allowedClasses(source);
    const wholeFileExempt = source.includes(ALLOW_MARKER) && exempt.size === 0;
    const rel = path.relative(root, abs).replace(/\\/g, '/');

    if (!wholeFileExempt) {
      const orphans = markupClasses(source).filter(
        (c) => !exempt.has(c) && !sheetDeclares(rootSheets, c),
      );
      if (orphans.length > 0) unstyledMarkup.push({ file: rel, classes: orphans.sort() });
    }

    const block = styleBlock(source);
    if (block === null || wholeFileExempt) continue;
    if (!path.relative(contentDir, abs).startsWith('..')) {
      inContentDir.push(rel);
      continue;
    }
    // A shared component keeps its <style> — that block is the only styling on the options page.
    const missing = classSelectors(block).filter(
      (c) => !exempt.has(c) && !sheetDeclares(shadowSheet, c),
    );
    if (missing.length > 0) unportedShared.push({ file: rel, classes: missing.sort() });
    const drift = mirrorDrift(block, shadowSheet);
    if (drift.length > 0) driftedCopies.push({ file: rel, lines: drift });
  }

  let failed = false;
  if (unstyledMarkup.length > 0) {
    failed = true;
    console.error(
      '✗ Shadow-CSS lint: these shadow-reachable components use an ega- class that no sheet reaching the shadow root declares.',
    );
    console.error(
      '  Add the rule to src/content/shadow.css (or src/shared/tokens.css), or add /* shadow-css-lint-allow: <class> — reason */.',
    );
    for (const { file, classes } of unstyledMarkup.sort((a, b) => a.file.localeCompare(b.file))) {
      console.error(`  ${file}: ${classes.join(', ')}`);
    }
  }
  if (inContentDir.length > 0) {
    failed = true;
    console.error(
      '✗ Shadow-CSS lint: these content components carry a <style> block that never reaches the shadow root.',
    );
    console.error(
      '  Move the rules into src/content/shadow.css, or add /* shadow-css-lint-allow */.',
    );
    for (const f of inContentDir.sort()) console.error(`  ${f}`);
  }
  if (unportedShared.length > 0) {
    failed = true;
    console.error(
      '✗ Shadow-CSS lint: these shared components are mounted into the shadow root, but some of their classes have no rule in src/content/shadow.css.',
    );
    console.error('  Port the missing rules into that sheet — the component keeps its <style>.');
    for (const { file, classes } of unportedShared.sort((a, b) => a.file.localeCompare(b.file))) {
      console.error(`  ${file}: ${classes.join(', ')}`);
    }
  }
  if (driftedCopies.length > 0) {
    failed = true;
    console.error(
      '✗ Shadow-CSS lint: the src/content/shadow.css copy of these shared components differs from the component <style>.',
    );
    console.error(
      '  Give the copy every declaration the component has, and delete copied rules the component no longer has.',
    );
    for (const { file, lines } of driftedCopies.sort((a, b) => a.file.localeCompare(b.file))) {
      console.error(`  ${file}:`);
      for (const line of lines) console.error(`    ${line}`);
    }
  }
  if (failed) process.exit(1);

  console.log(`✓ Shadow-CSS lint OK (${files.length} shadow-reachable components scanned)`);
}

const invokedDirectly =
  !!process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (invokedDirectly) void main();
