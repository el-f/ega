/** Reads each `codePaths` entry into ordered snippets, trimming every file's head-share to fit the byte budget. */
import { existsSync } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { MAX_CODE_BYTES_PER_FEATURE } from '../config';

export interface CodeSnippet {
  path: string;
  contents: string;
  truncated: boolean;
}

const TEXT_EXTS = new Set([
  '',
  '.tsx',
  '.js',
  '.mjs',
  '.cjs',
  '.svelte',
  '.css',
  '.html',
  '.json',
  '.md',
]);

async function listFiles(root: string, p: string): Promise<string[]> {
  const abs = path.resolve(root, p);
  if (!existsSync(abs)) return [];
  const s = await stat(abs);
  if (s.isFile()) return [abs];
  if (!s.isDirectory()) return [];
  const out: string[] = [];
  const walk = async (dir: string): Promise<void> => {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) await walk(full);
      else if (e.isFile() && TEXT_EXTS.has(path.extname(e.name))) out.push(full);
    }
  };
  await walk(abs);
  return out;
}

export async function loadCodeSnippets(
  root: string,
  codePaths: string[],
  budgetBytes: number = MAX_CODE_BYTES_PER_FEATURE,
): Promise<CodeSnippet[]> {
  const files: string[] = [];
  for (const p of codePaths) {
    files.push(...(await listFiles(root, p)));
  }
  // Read everything first so the total size is known.
  const raw: { path: string; contents: string }[] = [];
  for (const f of files) {
    try {
      const txt = await readFile(f, 'utf8');
      raw.push({ path: path.relative(root, f).replace(/\\/g, '/'), contents: txt });
    } catch {
      /* unreadable — skip */
    }
  }
  let total = raw.reduce((acc, r) => acc + r.contents.length, 0);
  if (total <= budgetBytes) {
    return raw.map((r) => ({ ...r, truncated: false }));
  }
  // Truncate proportional shares so every file keeps its head.
  const out: CodeSnippet[] = [];
  const share = Math.max(2_000, Math.floor(budgetBytes / Math.max(raw.length, 1)));
  for (const r of raw) {
    if (r.contents.length <= share) {
      out.push({ ...r, truncated: false });
      total -= r.contents.length;
    } else {
      out.push({
        path: r.path,
        contents: `${r.contents.slice(0, share)}\n/* … truncated (${r.contents.length - share} more bytes) */`,
        truncated: true,
      });
      total -= share;
    }
  }
  return out;
}
