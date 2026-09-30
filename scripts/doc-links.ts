import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Top-level directories a doc may cite. Anything else in a code span is prose, not a path. */
const REPO_DIRS = ['src', 'tests', 'scripts', 'native-host', 'docs', 'store', 'public', '.github'];

/** Root files docs cite by name. A bare `router.ts` inside a table is a column entry, not a path — only these resolve. */
const ROOT_FILES = new Set([
  'manifest.config.ts',
  'vite.config.ts',
  'eslint.config.js',
  'lefthook.yml',
  'package.json',
  'stryker.conf.mjs',
  'tsconfig.json',
  'playwright.config.ts',
]);

/** Docs that must match master. Everything else is skipped. */
const LIVE_DOC_GLOBS = [
  'README.md',
  'docs/*.md',
  'docs/conventions/**/*.md',
  'scripts/**/*.md',
  'tests/e2e/flows/README.md',
];

export interface Issue {
  line: number;
  kind: 'missing-doc' | 'missing-file' | 'line-number' | 'missing-symbol';
  message: string;
}

/** File access, injected so the checker stays pure and testable. Paths are repo-relative, POSIX-separated. */
export interface RepoFs {
  exists(repoPath: string): boolean;
  read(repoPath: string): string | null;
}

interface CodeRef {
  line: number;
  target: string;
  symbol?: string;
  lineRef?: string;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Lines that sit inside a ``` fence. Fenced text has no markdown links. */
function fencedLines(lines: readonly string[]): Set<number> {
  const out = new Set<number>();
  let open = '';
  for (const [i, raw] of lines.entries()) {
    const fence = /^\s*(`{3,})/.exec(raw ?? '');
    if (fence && (open === '' || fence[1] === open)) {
      open = open === '' ? (fence[1] ?? '') : '';
      out.add(i + 1);
      continue;
    }
    if (open !== '') out.add(i + 1);
  }
  return out;
}

/** Repo-path citations written as inline code: `src/x.ts`, `src/x.ts#symbol`, `src/x.ts:12`. */
export function findCodeRefs(content: string): CodeRef[] {
  const out: CodeRef[] = [];
  const lines = content.split('\n');
  for (const [i, raw] of lines.entries()) {
    for (const m of (raw ?? '').matchAll(/`([^`\n]+)`/g)) {
      const span = m[1] ?? '';
      const head = span.split('/')[0] ?? '';
      const rootFile = span.replace(/[:#].*$/, '');
      if (!REPO_DIRS.includes(head) && !ROOT_FILES.has(rootFile)) continue;
      // A glob, a brace set, a `<placeholder>` or an `.../` ellipsis names a family or a shape, not one file.
      if (/[*{}\s]|<[^<>]+>/.test(span) || span.includes('...')) continue;
      const withLine = /^(.+?):(\d+(?:-\d+)?)$/.exec(span);
      if (withLine) {
        out.push({ line: i + 1, target: withLine[1] ?? '', lineRef: withLine[2] ?? '' });
        continue;
      }
      const withSymbol = /^(.+?)#([a-z_$][\w$]*)$/i.exec(span);
      if (withSymbol) {
        out.push({ line: i + 1, target: withSymbol[1] ?? '', symbol: withSymbol[2] ?? '' });
        continue;
      }
      out.push({ line: i + 1, target: span });
    }
  }
  return out;
}

/** Markdown links to another file in this repo. Ignores external URLs and same-page anchors. */
export function findDocLinks(content: string): { line: number; target: string }[] {
  const out: { line: number; target: string }[] = [];
  const lines = content.split('\n');
  const fenced = fencedLines(lines);
  for (const [i, raw] of lines.entries()) {
    if (fenced.has(i + 1)) continue;
    const text = raw ?? '';
    const targets = [
      ...[...text.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)].map((m) => m[1] ?? ''),
      ...[...text.matchAll(/^\[[^\]]+\]:\s*(\S+)/g)].map((m) => m[1] ?? ''),
    ];
    for (const t of targets) {
      if (/^(?:https?:|mailto:|#|data:)/.test(t)) continue;
      out.push({ line: i + 1, target: t });
    }
  }
  return out;
}

function normalise(p: string): string {
  return p.replace(/\\/g, '/').replace(/\/+$/, '');
}

/** @param docPath repo-relative, so relative links resolve from the doc's own folder. */
export function checkDoc(docPath: string, content: string, repo: RepoFs): Issue[] {
  const issues: Issue[] = [];
  const dir = path.posix.dirname(normalise(docPath));

  for (const link of findDocLinks(content)) {
    const bare = link.target.split('#')[0] ?? '';
    if (bare === '') continue;
    const resolved = normalise(
      bare.startsWith('/') ? bare.slice(1) : path.posix.normalize(path.posix.join(dir, bare)),
    );
    if (!repo.exists(resolved)) {
      issues.push({
        line: link.line,
        kind: 'missing-doc',
        message: `link target does not exist: ${link.target}`,
      });
    }
  }

  for (const ref of findCodeRefs(content)) {
    const target = normalise(ref.target);
    if (!repo.exists(target)) {
      issues.push({
        line: ref.line,
        kind: 'missing-file',
        message: `cited path does not exist: ${ref.target}`,
      });
      continue;
    }
    if (ref.lineRef !== undefined) {
      issues.push({
        line: ref.line,
        kind: 'line-number',
        message: `\`${ref.target}:${ref.lineRef}\` — a line number rots on the next edit. Cite \`${ref.target}#someSymbol\`.`,
      });
      continue;
    }
    if (ref.symbol !== undefined) {
      const body = repo.read(target);
      if (body === null || !new RegExp(`\\b${escapeRegExp(ref.symbol)}\\b`).test(body)) {
        issues.push({
          line: ref.line,
          kind: 'missing-symbol',
          message: `\`${ref.symbol}\` does not appear in ${ref.target}`,
        });
      }
    }
  }

  return issues;
}

function listFiles(root: string, rel: string, out: string[]): void {
  const abs = path.join(root, rel);
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const next = rel === '' ? entry.name : `${rel}/${entry.name}`;
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue;
      listFiles(root, next, out);
    } else {
      out.push(next);
    }
  }
}

function globToRe(glob: string): RegExp {
  const body = glob
    .split('/')
    .map((seg) => (seg === '**' ? '(?:.+)' : escapeRegExp(seg).replace(/\\\*/g, '[^/]*')))
    .join('/')
    .replace(/\(\?:\.\+\)\//g, '(?:.+/)?');
  return new RegExp(`^${body}$`);
}

/** Tracked files that still exist, so the result matches CI; a checkout with no .git (a ZIP download) falls back to walking the tree. */
function repoFiles(root: string): string[] {
  try {
    return execFileSync('git', ['ls-files', '-z'], {
      cwd: root,
      encoding: 'utf8',
      timeout: 30_000,
    })
      .split('\0')
      .filter((f) => f !== '' && fs.existsSync(path.join(root, f)));
  } catch {
    const all: string[] = [];
    listFiles(root, '', all);
    return all;
  }
}

/** A gitignored path is a generated output (a report, a capture folder): cite it, never require it. */
function isIgnored(root: string, p: string): boolean {
  // A missing path cannot tell git it is a directory, so a `dir/` pattern needs the slash spelled out.
  return [p, `${p}/`].some((q) => {
    try {
      execFileSync('git', ['check-ignore', '-q', q], {
        cwd: root,
        stdio: 'ignore',
        timeout: 10_000,
      });
      return true;
    } catch {
      return false;
    }
  });
}

async function main(): Promise<void> {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const all = repoFiles(root);
  const known = new Set(all);
  const dirs = new Set<string>();
  for (const f of all) {
    let d = path.posix.dirname(f);
    while (d !== '.' && !dirs.has(d)) {
      dirs.add(d);
      d = path.posix.dirname(d);
    }
  }
  const repo: RepoFs = {
    exists: (p) => known.has(p) || dirs.has(p) || isIgnored(root, p),
    read: (p) => (known.has(p) ? fs.readFileSync(path.join(root, p), 'utf8') : null),
  };

  const patterns = LIVE_DOC_GLOBS.map(globToRe);
  const docs = all
    .filter((f) => f.endsWith('.md'))
    .filter((f) => patterns.some((re) => re.test(f)));

  let failures = 0;
  for (const doc of docs) {
    const issues = checkDoc(doc, fs.readFileSync(path.join(root, doc), 'utf8'), repo);
    if (issues.length === 0) continue;
    console.error(`✗ ${doc}`);
    for (const issue of issues) {
      console.error(`  L${issue.line} [${issue.kind}] ${issue.message}`);
      failures += 1;
    }
  }

  if (failures > 0) {
    console.error(`\n${failures} stale doc reference(s). The code is the truth — fix the doc.`);
    process.exit(1);
  }
  console.log(`✓ doc-links OK (${docs.length} docs scanned)`);
}

const invokedDirectly =
  !!process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (invokedDirectly) void main();
