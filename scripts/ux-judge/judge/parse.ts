/** Parses the judge's JSON verdict; the model sometimes wraps it in a ```json fence despite the prompt, so that parses too. */
import type { Severity } from '../config';

export interface JudgeFinding {
  axis: string;
  where: string;
  issue: string;
}

export interface JudgeVerdict {
  severity: Severity;
  findings: ReadonlyArray<JudgeFinding>;
  suggestions: ReadonlyArray<string>;
}

const SEVERITIES = new Set<string>(['ok', 'minor', 'major', 'blocker']);

export function parseJudgeVerdict(raw: string): JudgeVerdict {
  const m = raw.match(/```(?:json)?\n?([\s\S]*?)```/);
  const body = (m?.[1] ?? raw).trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch (e) {
    throw new Error(
      `judge verdict is not JSON: ${(e as Error).message}\nraw: ${raw.slice(0, 400)}`,
      { cause: e },
    );
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error(`judge verdict is not an object: ${typeof parsed}`);
  }
  const v = parsed as Partial<JudgeVerdict>;
  if (typeof v.severity !== 'string' || !SEVERITIES.has(v.severity)) {
    throw new Error(`bad severity: ${String(v.severity)}`);
  }
  const findings = Array.isArray(v.findings) ? v.findings : [];
  const suggestions = Array.isArray(v.suggestions) ? v.suggestions : [];
  return { severity: v.severity, findings, suggestions };
}
