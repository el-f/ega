import { readdir } from 'node:fs/promises';
import path from 'node:path';
import type { JudgePaths } from '../config';

export async function listCurrentShots(paths: JudgePaths): Promise<string[]> {
  const entries = await readdir(paths.currentDir).catch(() => []);
  return entries.filter((f) => f.endsWith('.png'));
}

export function currentPathFor(paths: JudgePaths, name: string): string {
  return path.join(paths.currentDir, name);
}
