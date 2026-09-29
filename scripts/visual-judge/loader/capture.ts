// Prefers the `current/` subdir and falls back to the flat layout older captures wrote.
import { existsSync } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import type { JudgePaths } from '../config';

export async function listCurrentShots(paths: JudgePaths): Promise<string[]> {
  try {
    const s = await stat(paths.currentDir);
    if (s.isDirectory()) {
      const entries = await readdir(paths.currentDir);
      const pngs = entries.filter((f) => f.endsWith('.png'));
      if (pngs.length) return pngs;
    }
  } catch {
    /* fall through */
  }
  const flat = await readdir(paths.auditDir);
  return flat.filter((f) => f.endsWith('.png'));
}

export function currentPathFor(paths: JudgePaths, name: string): string {
  const inCurrent = path.join(paths.currentDir, name);
  if (existsSync(inCurrent)) return inCurrent;
  return path.join(paths.auditDir, name);
}
