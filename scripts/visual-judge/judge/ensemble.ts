import { callClaudeOnShot } from './cli';
import { parseClaudeStream } from './parser';
import type { FileVerdict, ShotOverall } from './types';

export interface EnsembleResult {
  verdict: Omit<FileVerdict, 'file' | 'surface' | 'state'>;
  /** Raw stream-json from each roll, in dispatch order. */
  rawRolls: string[];
}

export function aggregateRolls(
  rolls: Omit<FileVerdict, 'file' | 'surface' | 'state'>[],
): Omit<FileVerdict, 'file' | 'surface' | 'state'> {
  if (rolls.length === 0) {
    return { issues: [], overall: 'unparseable' };
  }
  if (rolls.length === 1) {
    return rolls[0] as Omit<FileVerdict, 'file' | 'surface' | 'state'>;
  }
  // CLI and parse errors carry no signal, so they get no vote.
  const realRolls = rolls.filter((r) => r.overall !== 'cli-error' && r.overall !== 'unparseable');
  if (realRolls.length === 0) {
    const first = rolls[0] as Omit<FileVerdict, 'file' | 'surface' | 'state'>;
    return first;
  }
  const counts = new Map<ShotOverall, number>();
  for (const r of realRolls) counts.set(r.overall, (counts.get(r.overall) ?? 0) + 1);
  let topOverall: ShotOverall = 'ok';
  let topCount = 0;
  let tied = false;
  for (const [overall, count] of counts) {
    if (count > topCount) {
      topOverall = overall;
      topCount = count;
      tied = false;
    } else if (count === topCount) {
      tied = true;
    }
  }
  const majority = Math.floor(realRolls.length / 2) + 1;
  if (tied || topCount < majority) {
    const fallback = realRolls[0] as Omit<FileVerdict, 'file' | 'surface' | 'state'>;
    return { ...fallback, overall: 'inconclusive' };
  }
  // First roll matching the modal verdict, so the pick stays deterministic.
  const canonical = realRolls.find((r) => r.overall === topOverall);
  return canonical ?? (realRolls[0] as Omit<FileVerdict, 'file' | 'surface' | 'state'>);
}

export async function runShotWithRolls(
  imgPath: string,
  prompt: string,
  rolls: number,
): Promise<EnsembleResult> {
  const safeRolls = Math.max(1, Math.floor(rolls));
  const streams: string[] = [];
  const parsed: Omit<FileVerdict, 'file' | 'surface' | 'state'>[] = [];
  for (let i = 0; i < safeRolls; i++) {
    const stream = await callClaudeOnShot(imgPath, prompt);
    streams.push(stream);
    parsed.push(parseClaudeStream(stream));
  }
  return { verdict: aggregateRolls(parsed), rawRolls: streams };
}
