import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Pointer/focus state must not resize an in-flow element — siblings below it jump.

const STATE_RE = /:(?:hover|focus-within|focus-visible|focus|active)\b/;
const STATE_PSEUDO_RE = /:(?:hover|focus-within|focus-visible|focus|active)\b/g;
const FUNCTIONAL_PSEUDO_RE = /:(?:not|is|where|has)\([^)]*\)/g;
const PSEUDO_EL_RE = /::?(?:before|after)\b/;
const ALLOW_MARKER = 'hover-lint-allow';
const COMMENT_RE_CSS = /\/\*[\s\S]*?\*\//g;
const STYLE_BLOCK_RE = /<style[^>]*>([\s\S]*?)<\/style>/gi;

// `border` and its per-side forms carry a width; `-color`/`-radius`/`-style` do not.
const REFLOW_PROP_RE = new RegExp(
  '^(?:' +
    [
      '(?:min-|max-)?(?:width|height|inline-size|block-size)',
      '(?:padding|margin)(?:-(?:top|right|bottom|left|inline|block)(?:-(?:start|end))?)?',
      'border(?:-(?:top|right|bottom|left|inline|block)(?:-(?:start|end))?)?(?:-width)?',
      '(?:row-|column-)?gap',
      'font|font-(?:size|weight|family|stretch)',
      'letter-spacing|word-spacing|line-height',
      'display|position|float|vertical-align|order',
      'flex|flex-(?:basis|grow|shrink|direction)',
      'grid-template-(?:columns|rows)|grid-auto-flow',
      'white-space|text-transform|writing-mode',
      'zoom|aspect-ratio|columns|column-count|column-width',
      'top|right|bottom|left|inset(?:-(?:inline|block))?(?:-(?:start|end))?',
    ].join('|') +
    ')$',
);

export interface Violation {
  file: string;
  line: number;
  selector: string;
  prop: string;
  snippet: string;
}

function blankPreserveLines(s: string): string {
  return s.replace(/[^\n]/g, ' ');
}

// Matches a state rule to its base rule: `.a::after` and `.a:hover::after` are one box.
function outOfFlowKey(selector: string): string | null {
  const last =
    selector
      .split(/[\s>+~]+/)
      .filter(Boolean)
      .pop() ?? '';
  const pseudoEl = PSEUDO_EL_RE.exec(last)?.[0] ?? '';
  const bare = last
    .replace(new RegExp(PSEUDO_EL_RE.source, 'g'), '')
    .replace(FUNCTIONAL_PSEUDO_RE, '')
    .replace(STATE_PSEUDO_RE, '');
  const head = /^(?:\[[^\]]*\]|[.#]?[\w-]+|\*)/.exec(bare)?.[0] ?? '';
  return head ? head + pseudoEl : null;
}

function isOutOfFlow(body: string): boolean {
  return /position\s*:\s*(?:absolute|fixed)/.test(body);
}

function lineOf(source: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i++) if (source[i] === '\n') line++;
  return line;
}

interface Rule {
  selector: string;
  body: string;
  bodyStart: number;
}

// Offsets stay against the original text so line numbers survive comment blanking.
function parseRules(stripped: string): Rule[] {
  const rules: Rule[] = [];
  let selStart = 0;
  for (let i = 0; i < stripped.length; i++) {
    const ch = stripped[i];
    if (ch === '}' || ch === ';') {
      selStart = i + 1;
      continue;
    }
    if (ch !== '{') continue;
    const selector = stripped.slice(selStart, i).trim().replace(/\s+/g, ' ');
    const bodyStart = i + 1;
    let depth = 1;
    let j = bodyStart;
    for (; j < stripped.length && depth > 0; j++) {
      if (stripped[j] === '{') depth++;
      else if (stripped[j] === '}') depth--;
    }
    selStart = i + 1;
    // @media/@supports hold rules, not declarations; the loop reaches those rules itself.
    if (!selector.startsWith('@')) {
      rules.push({ selector, body: stripped.slice(bodyStart, j - 1), bodyStart });
    }
  }
  return rules;
}

function scanCss(css: string, offset: number, source: string, file: string): Violation[] {
  const stripped = css.replace(COMMENT_RE_CSS, blankPreserveLines);
  const origLines = source.split('\n');
  const rules = parseRules(stripped);

  const outOfFlow = new Set<string>();
  for (const r of rules) {
    if (!isOutOfFlow(r.body)) continue;
    for (const sel of r.selector.split(',')) {
      // A rule that only turns absolute on hover is itself the shift — no exemption.
      if (STATE_RE.test(sel) && !PSEUDO_EL_RE.test(sel)) continue;
      const key = outOfFlowKey(sel);
      if (key) outOfFlow.add(key);
    }
  }

  const out: Violation[] = [];
  for (const r of rules) {
    if (!STATE_RE.test(r.selector)) continue;
    if (r.selector.split(',').every((sel) => outOfFlow.has(outOfFlowKey(sel) ?? ' '))) continue;

    const declRe = /(?:^|[;{])\s*([-a-z]+)\s*:/g;
    let m: RegExpExecArray | null;
    while ((m = declRe.exec(r.body)) !== null) {
      const prop = m[1] ?? '';
      if (!REFLOW_PROP_RE.test(prop)) continue;
      const absIndex = offset + r.bodyStart + m.index + m[0].indexOf(prop);
      const line = lineOf(source, absIndex);
      if (origLines[line - 1]?.includes(ALLOW_MARKER)) continue;
      out.push({
        file,
        line,
        selector: r.selector,
        prop,
        snippet: (origLines[line - 1] ?? '').trim(),
      });
    }
  }
  return out;
}

export function lintSvelte(source: string, file: string): Violation[] {
  const out: Violation[] = [];
  for (const m of source.matchAll(STYLE_BLOCK_RE)) {
    const css = m[1] ?? '';
    out.push(...scanCss(css, m.index + m[0].indexOf(css), source, file));
  }
  return out;
}

export function lintCss(source: string, file: string): Violation[] {
  return scanCss(source, 0, source, file);
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
  const files: string[] = [];
  await walk(path.join(root, 'src'), ['.svelte', '.css'], files);

  const violations: Violation[] = [];
  for (const abs of files) {
    const rel = path.relative(root, abs).replace(/\\/g, '/');
    const source = await readFile(abs, 'utf8');
    violations.push(...(abs.endsWith('.svelte') ? lintSvelte(source, rel) : lintCss(source, rel)));
  }

  if (violations.length > 0) {
    console.error('✗ Hover-lint: pointer/focus state resizes elements in normal flow.');
    console.error('  Reserve the space at rest, take the element out of flow, or add');
    console.error('  `/* hover-lint-allow: reason */` on the line.');
    for (const v of violations) {
      console.error(`  ${v.file}:${v.line}  ${v.selector} → ${v.prop}`);
    }
    process.exit(1);
  }
  console.log(`✓ Hover-lint OK (${files.length} files scanned)`);
}

const invokedDirectly =
  !!process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (invokedDirectly) void main();
