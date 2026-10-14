import fs from 'node:fs/promises';
import path from 'node:path';
import { CONFIG } from '../config';
import type { JudgeVerdict } from '../judge/parse';

export interface RunRow {
  coverage: string;
  verdict: JudgeVerdict;
  judgeModel: string;
  at: string;
}

export async function writeRunJson(
  rows: ReadonlyArray<RunRow>,
  runId: string,
  root: string = CONFIG.reportRoot,
): Promise<string> {
  await fs.mkdir(root, { recursive: true });
  const file = path.join(root, `${runId}.json`);
  await fs.writeFile(file, JSON.stringify({ runId, rows }, null, 2));
  return file;
}
