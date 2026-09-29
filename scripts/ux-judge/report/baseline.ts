import fs from 'node:fs/promises';
import path from 'node:path';
import { CONFIG } from '../config';
import type { RunRow } from './json';

/** Promote a run to the baseline. `current.json` is swapped by rename, so a reader never sees a half-written file. */
export async function promoteBaseline(rows: ReadonlyArray<RunRow>, date: string): Promise<string> {
  const historyDir = path.join(CONFIG.baselineRoot, 'history');
  await fs.mkdir(historyDir, { recursive: true });
  const archive = path.join(historyDir, `${date}.json`);
  const current = path.join(CONFIG.baselineRoot, 'current.json');
  const now = new Date().toISOString();
  const body = JSON.stringify({ at: now, date, rows }, null, 2);
  // Archive prior current (if any) before overwriting.
  const priorRaw = await fs.readFile(current, 'utf-8').catch(() => null);
  if (priorRaw) {
    try {
      const prior = JSON.parse(priorRaw) as { date?: string; at?: string };
      const priorDate =
        typeof prior.date === 'string'
          ? prior.date
          : typeof prior.at === 'string'
            ? prior.at.slice(0, 10)
            : 'unknown';
      await fs.writeFile(path.join(historyDir, `${priorDate}-prior.json`), priorRaw);
    } catch {
      await fs.writeFile(path.join(historyDir, `${date}-prior-malformed.json`), priorRaw);
    }
  }
  await fs.writeFile(archive, body);
  const tmp = `${current}.tmp`;
  await fs.writeFile(tmp, body);
  await fs.rename(tmp, current);
  return current;
}
