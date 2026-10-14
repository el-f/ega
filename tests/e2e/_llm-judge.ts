// Opt-in: without EGA_LLM_JUDGE=1 every call returns a benign `ok` verdict.

import { spawn } from 'node:child_process';
import type { Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export interface JudgeIssue {
  description: string;
  severity: 'minor' | 'major';
}

export type JudgeSeverity = 'ok' | 'minor' | 'major' | 'unparseable' | 'cli-error';

export interface JudgeVerdict {
  severity: JudgeSeverity;
  issues: JudgeIssue[];
  raw: string;
}

const DEFAULT_PROMPT = [
  'You are judging a Chrome extension UI screenshot for visible bugs.',
  'List any visible issues: overlapping text, truncated labels, misaligned elements,',
  'low-contrast content, orphaned or duplicated affordances, broken layouts.',
  'Ignore content semantics — focus on whether the UI renders correctly.',
  'Return ONLY a single JSON object:',
  '{"issues": [{"description": string, "severity": "minor"|"major"}], "overall": "ok"|"minor-issues"|"major-issues"}.',
  'If nothing is wrong, return {"issues": [], "overall": "ok"}.',
].join(' ');

export function parseJudgeResponse(streamOutput: string): JudgeVerdict {
  const lines = streamOutput.split('\n').filter((l) => l.trim().length > 0);
  let text = '';
  let cliError = false;
  for (const line of lines) {
    try {
      const msg = JSON.parse(line) as Record<string, unknown>;
      if (msg['type'] === 'result' && msg['is_error'] === true) {
        cliError = true;
      }
      if (msg['type'] === 'assistant') {
        const content = (msg['message'] as { content?: Array<{ type: string; text?: string }> })
          .content;
        if (content) {
          for (const c of content) {
            if (c.type === 'text' && typeof c.text === 'string') text += c.text;
          }
        }
      }
    } catch {
      /* non-JSON line, skip */
    }
  }
  if (cliError && text.length === 0) {
    return { severity: 'cli-error', issues: [], raw: streamOutput };
  }
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return { severity: 'unparseable', issues: [], raw: streamOutput };
  try {
    const parsed = JSON.parse(jsonMatch[0]) as { issues?: JudgeIssue[]; overall?: string };
    const issues: JudgeIssue[] = Array.isArray(parsed.issues) ? parsed.issues : [];
    const hasMajor = issues.some((i) => i.severity === 'major');
    const severity: JudgeSeverity =
      parsed.overall === 'major-issues' || hasMajor
        ? 'major'
        : parsed.overall === 'minor-issues' || issues.length > 0
          ? 'minor'
          : 'ok';
    return { severity, issues, raw: streamOutput };
  } catch {
    return { severity: 'unparseable', issues: [], raw: streamOutput };
  }
}

export interface JudgeUIOptions {
  prompt?: string;
  cli?: 'claude' | 'codex';
  timeoutMs?: number;
  /** Fail the spec on this severity or higher. Default: `'major'`. */
  failOn?: 'minor' | 'major';
}

/** Runs the judge, throws on `major`, warns on any other verdict. */
export async function judgeOrThrow(
  page: Page,
  label: string,
  opts: JudgeUIOptions = {},
): Promise<JudgeVerdict> {
  const verdict = await judgeUI(page, opts);
  if (verdict.severity === 'major') {
    throw new Error(
      `[${label}] LLM judge flagged major issues:\n${JSON.stringify(verdict.issues, null, 2)}`,
    );
  }
  if (verdict.severity === 'minor' || verdict.severity === 'unparseable') {
    console.warn(
      `[${label}] LLM judge: ${verdict.severity}`,
      JSON.stringify(verdict.issues, null, 2),
    );
  }
  return verdict;
}

export async function judgeUI(page: Page, opts: JudgeUIOptions = {}): Promise<JudgeVerdict> {
  if (process.env['EGA_LLM_JUDGE'] !== '1') {
    return { severity: 'ok', issues: [], raw: '(skipped: EGA_LLM_JUDGE not set)' };
  }
  const cli = opts.cli ?? 'claude';
  const prompt = opts.prompt ?? DEFAULT_PROMPT;
  const timeoutMs = opts.timeoutMs ?? 60_000;

  const outDir = path.resolve(process.cwd(), 'reports/llm-judge');
  await mkdir(outDir, { recursive: true });
  const stem = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const imgPath = path.join(outDir, `${stem}.png`);
  const buf = await page.screenshot({ fullPage: true });
  await writeFile(imgPath, buf);

  const fullPrompt = `${prompt}\n\n@${imgPath.replace(/\\/g, '/')}`;
  return new Promise<JudgeVerdict>((resolve) => {
    let out = '';
    let err = '';
    const proc = spawn(cli, ['-p', fullPrompt, '--output-format', 'stream-json', '--verbose'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    });
    const to = setTimeout(() => {
      proc.kill('SIGKILL');
      resolve({ severity: 'cli-error', issues: [], raw: `timeout after ${timeoutMs}ms\n${err}` });
    }, timeoutMs);
    proc.stdout.on('data', (d: Buffer) => {
      out += d.toString();
    });
    proc.stderr.on('data', (d: Buffer) => {
      err += d.toString();
    });
    proc.on('error', (e) => {
      clearTimeout(to);
      resolve({ severity: 'cli-error', issues: [], raw: `spawn error: ${e.message}` });
    });
    proc.on('close', (code) => {
      clearTimeout(to);
      if (code !== 0) {
        resolve({ severity: 'cli-error', issues: [], raw: `exit ${code}\n${err}\n${out}` });
        return;
      }
      resolve(parseJudgeResponse(out));
    });
  });
}
