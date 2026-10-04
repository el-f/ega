import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseAst } from 'vite';

export interface BundleEntry {
  name: string;
  bytes: number;
}

export interface CrxManifest {
  content_scripts?: { js?: string[]; css?: string[] }[];
  web_accessible_resources?: { resources?: string[] }[];
}

/** CRXJS lifts component CSS here from the content entry, and the browser injects it into every matched page, outside the shadow root. */
export function injectedContentCss(manifest: CrxManifest): string[] {
  return (manifest.content_scripts ?? []).flatMap((cs) => cs.css ?? []);
}

/** A web-accessible stylesheet is one any page can load, and the content script's preload helper links it into the host page. */
export function webAccessibleCss(manifest: CrxManifest): string[] {
  return (manifest.web_accessible_resources ?? [])
    .flatMap((w) => w.resources ?? [])
    .filter((r) => r.endsWith('.css'));
}

// Static ESM only. `import("./x.js")` has a paren where this needs a quote; eagerDynamicImports reads those.
const STATIC_IMPORT =
  /\b(?:import|export)(?:\s*(?:\{[^}]*\}|\*(?:\s*as\s+[\w$]+)?|[\w$]+(?:\s*,\s*(?:\{[^}]*\}|\*\s*as\s+[\w$]+))?)\s*from)?\s*(["'])([^"']+)\1/g;

export function staticImportSpecifiers(code: string): string[] {
  const out: string[] = [];
  for (const m of code.matchAll(STATIC_IMPORT)) if (m[2]) out.push(m[2]);
  return out;
}

/** The CRXJS content loader is an IIFE whose only job is to dynamic-import the real entry by extension URL. */
export function contentEntryFromLoader(code: string): string | null {
  return /getURL\(\s*(["'])([^"']+)\1\s*\)/.exec(code)?.[2] ?? null;
}

type AstNode = { type: string; [key: string]: unknown };

const isFunction = (n: AstNode): boolean =>
  n.type === 'FunctionDeclaration' ||
  n.type === 'FunctionExpression' ||
  n.type === 'ArrowFunctionExpression';

const isVitePreloadDeps = (n: AstNode | undefined): boolean =>
  n !== undefined &&
  (n.type === 'ArrayExpression' ||
    (n.type === 'UnaryExpression' && n['operator'] === 'void') ||
    (n.type === 'CallExpression' &&
      (n['callee'] as AstNode | undefined)?.type === 'Identifier' &&
      (n['callee'] as AstNode)['name'] === '__vite__mapDeps'));

/** The functions a call runs at once: an IIFE, `fn.call()`/`fn.apply()`, and vite's `__vitePreload(() => import(…), deps)` wrapper. */
function runsNow(n: AstNode): Set<unknown> {
  const now = new Set<unknown>();
  if (n.type !== 'CallExpression') return now;
  const callee = n['callee'] as AstNode;
  if (isFunction(callee)) now.add(callee);
  if (callee.type === 'MemberExpression') {
    const object = callee['object'] as AstNode;
    const prop = callee['property'] as AstNode;
    // The member is the child the walk meets; its object is the function that runs.
    if (isFunction(object) && (prop['name'] === 'call' || prop['name'] === 'apply'))
      now.add(callee);
  }
  const args = n['arguments'] as AstNode[];
  if (args[0] && isFunction(args[0]) && isVitePreloadDeps(args[1])) now.add(args[0]);
  return now;
}

/** The Oxc minifier writes string specifiers as backtick literals with no `${}`. */
function constantSpecifier(src: AstNode | undefined): string | null {
  if (src?.type === 'Literal' && typeof src['value'] === 'string') return src['value'];
  if (src?.type !== 'TemplateLiteral' || (src['expressions'] as unknown[]).length > 0) return null;
  const cooked = (src['quasis'] as AstNode[])[0]?.['value'] as { cooked?: unknown } | undefined;
  return typeof cooked?.cooked === 'string' ? cooked.cooked : null;
}

/** `import("./x.js")` that runs as the module loads: outside every function, or in one the module calls at once. */
export function eagerDynamicImports(code: string): string[] {
  let ast: AstNode;
  try {
    ast = parseAst(code) as unknown as AstNode;
  } catch {
    return [];
  }
  const out: string[] = [];
  const visit = (node: unknown, eager: boolean): void => {
    if (Array.isArray(node)) {
      for (const n of node) visit(n, eager);
      return;
    }
    if (node === null || typeof node !== 'object' || typeof (node as AstNode).type !== 'string')
      return;
    const n = node as AstNode;
    if (n.type === 'ImportExpression' && eager) {
      const spec = constantSpecifier(n['source'] as AstNode | undefined);
      if (spec !== null) out.push(spec);
    }
    // These bodies run now; any other function's body runs later, if ever.
    const now = runsNow(n);
    for (const [key, child] of Object.entries(n)) {
      if (key === 'type') continue;
      for (const c of Array.isArray(child) ? (child as unknown[]) : [child]) {
        if (now.has(c)) {
          const fn =
            (c as AstNode).type === 'MemberExpression'
              ? ((c as AstNode)['object'] as AstNode)
              : (c as AstNode);
          visit(fn['body'], eager);
        } else visit(c, eager && !isFunction(n));
      }
    }
  };
  visit(ast, true);
  return out;
}

/** Every chunk the page parses before the content script's first line runs; with `eager`, also every chunk a module-scope `import()` loads. */
export function walkStaticGraph(
  entry: string,
  read: (rel: string) => string | null,
  eager = false,
): string[] {
  const seen = new Set<string>();
  const visit = (rel: string): void => {
    if (seen.has(rel)) return;
    seen.add(rel);
    const code = read(rel);
    if (code === null) return;
    const dir = path.posix.dirname(rel);
    const specs = staticImportSpecifiers(code);
    if (eager) specs.push(...eagerDynamicImports(code));
    for (const spec of specs) {
      if (!spec.startsWith('.')) continue;
      visit(path.posix.normalize(path.posix.join(dir, spec)));
    }
  };
  visit(entry);
  return [...seen].sort();
}

/** Every `/assets/…` script, modulepreload and stylesheet an extension page pulls before its first paint. */
export function pagePreloadAssets(html: string): string[] {
  const out = new Set<string>();
  for (const m of html.matchAll(/<(?:script|link)\s[^>]*?(?:src|href)="\/(assets\/[^"]+)"/g)) {
    if (m[1]) out.add(m[1]);
  }
  return [...out].sort();
}

interface BudgetResult {
  ok: boolean;
  message: string;
  deltas: Array<{ name: string; delta: number; fromBytes: number; toBytes: number }>;
}

export function compareBundles(
  current: BundleEntry[],
  baseline: BundleEntry[],
  threshold: number,
): BudgetResult {
  if (baseline.length === 0) {
    return {
      ok: false,
      message: `No bundle baseline. Run 'pnpm bundle:budget --set' to initialize.`,
      deltas: [],
    };
  }
  const baselineBy = new Map(baseline.map((b) => [b.name, b.bytes]));
  const currentBy = new Map(current.map((c) => [c.name, c.bytes]));
  const deltas: BudgetResult['deltas'] = [];
  const lines: string[] = [];
  let failed = false;
  for (const c of current) {
    const prev = baselineBy.get(c.name);
    if (prev === undefined) {
      lines.push(`+ ${c.name}: new (${c.bytes}B)`);
      continue;
    }
    const ratio = (c.bytes - prev) / prev;
    deltas.push({ name: c.name, delta: ratio, fromBytes: prev, toBytes: c.bytes });
    if (ratio > threshold) {
      failed = true;
      lines.push(
        `x ${c.name} grew ${(ratio * 100).toFixed(1)}% (${prev}B -> ${c.bytes}B, threshold ${(threshold * 100).toFixed(0)}%)`,
      );
    } else if (ratio < -0.01) {
      lines.push(`ok ${c.name} shrank ${(-ratio * 100).toFixed(1)}% (${prev}B -> ${c.bytes}B)`);
    }
  }
  for (const [name] of baselineBy) {
    if (!currentBy.has(name)) lines.push(`- ${name}: removed`);
  }
  return {
    ok: !failed,
    message: lines.length > 0 ? lines.join('\n') : 'No changes.',
    deltas,
  };
}

/** The sum over every chunk, so a rename or a split cannot hide growth from the per-name check. */
export function compareTotalBytes(
  current: BundleEntry[],
  baseline: BundleEntry[],
  threshold: number,
): { ok: boolean; message: string } {
  const sum = (entries: BundleEntry[]): number => entries.reduce((s, e) => s + e.bytes, 0);
  const now = sum(current);
  const before = sum(baseline);
  if (before === 0) return { ok: false, message: 'x total bytes: no baseline to compare with.' };
  const ratio = (now - before) / before;
  if (ratio > threshold) {
    return {
      ok: false,
      message: `x total grew ${(ratio * 100).toFixed(1)}% (${before}B -> ${now}B, threshold ${(threshold * 100).toFixed(0)}%)`,
    };
  }
  return { ok: true, message: `ok total ${now}B / ${before}B baseline.` };
}

function measureDist(distDir: string): BundleEntry[] {
  const assetsDir = path.join(distDir, 'assets');
  if (!existsSync(assetsDir)) return [];
  const files = readdirSync(assetsDir);
  const byEntry = new Map<string, number>();
  for (const f of files) {
    if (!f.endsWith('.js') && !f.endsWith('.css')) continue;
    // Vite hashes are exactly 8 chars and may hold `-`, so match 8 — a greedy `-[\w-]+` eats the entry name.
    const entry = f.replace(/-[\w-]{8}\.(js|css)$/, '');
    const size = readFileSync(path.join(assetsDir, f)).length;
    byEntry.set(entry, (byEntry.get(entry) ?? 0) + size);
  }
  return [...byEntry.entries()]
    .map(([name, bytes]) => ({ name, bytes }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Static imports plus module-scope import() chunks: both load on every page. A ratchet: raise or lower it in the commit that earns it. */
const EAGER_CONTENT_BUDGET_BYTES = 169_300;

/** The popup opens on every toolbar click, so its preload set is the one extension-page cost a user feels. Ratchet, like the one above. */
const POPUP_PAGE_BUDGET_BYTES = 491_000;

function measurePagePreload(distDir: string, htmlRel: string): { files: string[]; bytes: number } {
  const htmlPath = path.join(distDir, htmlRel);
  if (!existsSync(htmlPath)) return { files: [], bytes: 0 };
  const files = pagePreloadAssets(readFileSync(htmlPath, 'utf8'));
  let bytes = 0;
  for (const f of files) {
    const p = path.join(distDir, f);
    if (existsSync(p)) bytes += readFileSync(p).length;
  }
  return { files, bytes };
}

function measureEagerContentScript(
  distDir: string,
  manifest: CrxManifest,
): { files: string[]; bytes: number } {
  const read = (rel: string): string | null => {
    const p = path.join(distDir, rel);
    return existsSync(p) ? readFileSync(p, 'utf8') : null;
  };
  const files = new Set<string>();
  for (const cs of manifest.content_scripts ?? []) {
    for (const loaderRel of cs.js ?? []) {
      files.add(loaderRel);
      const loader = read(loaderRel);
      const entry = loader === null ? null : contentEntryFromLoader(loader);
      for (const f of walkStaticGraph(entry ?? loaderRel, read, true)) files.add(f);
    }
  }
  let bytes = 0;
  for (const f of files) {
    const p = path.join(distDir, f);
    if (existsSync(p)) bytes += readFileSync(p).length;
  }
  return { files: [...files].sort(), bytes };
}

async function main(): Promise<void> {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const root = path.resolve(__dirname, '..');
  const args = process.argv.slice(2);
  const set = args.includes('--set');
  // Vendor bumps drift the per-chunk sizes on their own, so pre-push warns on drift — the two invariants below still fail it.
  const warnOnlyDrift = args.includes('--warn-only');
  const distDir = path.join(root, 'dist');
  const current = measureDist(distDir);
  if (current.length === 0) {
    console.error('x dist/assets/ empty - run `pnpm build` first.');
    process.exit(1);
  }
  const baselinePath = path.join(root, 'scripts', 'bundle-baseline.json');
  if (set) {
    writeFileSync(baselinePath, JSON.stringify(current, null, 2) + '\n');
    console.log(
      `ok Baseline set (${current.length} entries, ${current.reduce((s, e) => s + e.bytes, 0)} total bytes).`,
    );
    return;
  }
  const baseline = existsSync(baselinePath)
    ? (JSON.parse(readFileSync(baselinePath, 'utf8')) as BundleEntry[])
    : [];
  const r = compareBundles(current, baseline, 0.1);
  console.log(r.message);

  let failed = !r.ok && !warnOnlyDrift;
  // Hard even under --warn-only: chunk renames cannot move the sum.
  const total = compareTotalBytes(current, baseline, 0.1);
  if (total.ok) console.log(total.message);
  else {
    failed = true;
    console.error(total.message);
  }
  const manifestPath = path.join(distDir, 'manifest.json');
  if (!existsSync(manifestPath)) {
    console.error('x dist/manifest.json missing - run `pnpm build` first.');
    process.exit(1);
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as CrxManifest;

  const css = injectedContentCss(manifest);
  if (css.length > 0) {
    failed = true;
    console.error(
      `x content_scripts[].css is not empty - ${css.length} sheet(s) inject into every page:\n  ${css.join('\n  ')}`,
    );
  } else {
    console.log('ok content_scripts[].css is empty.');
  }

  const warCss = webAccessibleCss(manifest);
  if (warCss.length > 0) {
    failed = true;
    console.error(
      `x web_accessible_resources lists ${warCss.length} stylesheet(s) any page can load:\n  ${warCss.join('\n  ')}`,
    );
  } else {
    console.log('ok web_accessible_resources lists no stylesheet.');
  }

  const eager = measureEagerContentScript(distDir, manifest);
  if (eager.bytes > EAGER_CONTENT_BUDGET_BYTES) {
    failed = true;
    console.error(
      `x eager content script is ${eager.bytes}B over a ${EAGER_CONTENT_BUDGET_BYTES}B budget (${eager.files.length} chunks):\n  ${eager.files.join('\n  ')}`,
    );
  } else {
    console.log(
      `ok eager content script ${eager.bytes}B / ${EAGER_CONTENT_BUDGET_BYTES}B (${eager.files.length} chunks).`,
    );
  }

  const popup = measurePagePreload(distDir, 'src/popup/index.html');
  // A moved html or a changed href shape would read as "0 B, ok" forever; an empty measurement is a failure.
  if (popup.files.length === 0) {
    failed = true;
    console.error(
      'x popup preload measurement found no /assets/ references in dist/src/popup/index.html',
    );
  } else if (popup.bytes > POPUP_PAGE_BUDGET_BYTES) {
    failed = true;
    console.error(
      `x popup preloads ${popup.bytes}B over a ${POPUP_PAGE_BUDGET_BYTES}B budget (${popup.files.length} assets):\n  ${popup.files.join('\n  ')}`,
    );
  } else {
    console.log(
      `ok popup preloads ${popup.bytes}B / ${POPUP_PAGE_BUDGET_BYTES}B (${popup.files.length} assets).`,
    );
  }

  if (failed) process.exit(1);
}

const invokedDirectly =
  !!process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (invokedDirectly) void main();
