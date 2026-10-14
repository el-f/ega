/** Spawns the local `claude` CLI in stream-json mode. Both entry points return raw text and never reject; parsing lives in `parser.ts`. */
import { spawn } from 'node:child_process';
import { SHOT_TIMEOUT_MS, FEATURE_TIMEOUT_MS } from '../config';

interface SpawnOpts {
  timeoutMs: number;
  allowedTools?: string[];
  addDirs?: string[];
}

function runClaude(prompt: string, opts: SpawnOpts): Promise<string> {
  const args = ['-p', '--output-format', 'stream-json', '--verbose'];
  if (opts.allowedTools && opts.allowedTools.length) {
    args.push('--allowedTools', opts.allowedTools.join(','));
  }
  if (opts.addDirs && opts.addDirs.length) {
    args.push('--add-dir', ...opts.addDirs);
  }
  return new Promise((resolve) => {
    let out = '';
    let err = '';
    const proc = spawn('claude', args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    });
    const to = setTimeout(() => {
      proc.kill('SIGKILL');
      resolve(`__TIMEOUT__\n${err}`);
    }, opts.timeoutMs);
    proc.stdout.on('data', (d: Buffer) => {
      out += d.toString();
    });
    proc.stderr.on('data', (d: Buffer) => {
      err += d.toString();
    });
    proc.on('error', (e) => {
      clearTimeout(to);
      resolve(`__SPAWN_ERROR__: ${e.message}`);
    });
    proc.on('close', (code) => {
      clearTimeout(to);
      if (code !== 0 && !out) resolve(`__EXIT_${code}__\n${err}\n${out}`);
      else resolve(out);
    });
    proc.stdin.write(prompt);
    proc.stdin.end();
  });
}

export function callClaudeOnShot(
  imgPath: string,
  prompt: string,
  timeoutMs: number = SHOT_TIMEOUT_MS,
): Promise<string> {
  const fullPrompt = `${prompt}\n\n@${imgPath.replace(/\\/g, '/')}`;
  return runClaude(fullPrompt, { timeoutMs });
}

export interface FeatureCliInput {
  prompt: string;
  imagePaths: string[];
  allowedTools?: string[];
  addDirs?: string[];
  timeoutMs?: number;
}

export function callClaudeOnFeature(input: FeatureCliInput): Promise<string> {
  const refs = input.imagePaths.map((p) => `@${p.replace(/\\/g, '/')}`).join('\n');
  const fullPrompt = `${input.prompt}\n\n## Screenshots\n${refs}`;
  const opts: SpawnOpts = { timeoutMs: input.timeoutMs ?? FEATURE_TIMEOUT_MS };
  if (input.allowedTools && input.allowedTools.length) opts.allowedTools = input.allowedTools;
  if (input.addDirs && input.addDirs.length) opts.addDirs = input.addDirs;
  return runClaude(fullPrompt, opts);
}
