/** Returns {} for a missing or corrupt file, so every shot goes to the model. */
import { readFile } from 'node:fs/promises';
import type { BaselineVerdictMap } from '../judge/types';

export async function loadBaselineVerdicts(path: string): Promise<BaselineVerdictMap> {
  try {
    const raw = await readFile(path, 'utf8');
    return JSON.parse(raw) as BaselineVerdictMap;
  } catch {
    return {};
  }
}
