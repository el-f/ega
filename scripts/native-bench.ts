// Cold vs warm TTFT bench for the native host. Needs the BENCH_PROVIDER CLI installed and logged in; manual only, never CI.

import { spawn, type ChildProcessByStdio } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import path from 'node:path';
import process from 'node:process';
import type { Readable, Writable } from 'node:stream';
import { fileURLToPath } from 'node:url';

// --- Pure helpers (exported for unit tests) --------------------------------

/** Encode an object as a Chrome native-messaging frame: 4-byte LE length + UTF-8 JSON body. */
export function frame(obj: unknown): Buffer {
  const body = Buffer.from(JSON.stringify(obj), 'utf8');
  const len = Buffer.alloc(4);
  len.writeUInt32LE(body.length, 0);
  return Buffer.concat([len, body]);
}

export interface FrameParserState {
  buf: Buffer;
}

/** Parse every complete frame in `state.buf + chunk`; a partial tail stays in `state.buf`. */
export function parseFrames(state: FrameParserState, chunk: Buffer): unknown[] {
  state.buf = state.buf.length === 0 ? chunk : Buffer.concat([state.buf, chunk]);
  const out: unknown[] = [];
  while (state.buf.length >= 4) {
    const len = state.buf.readUInt32LE(0);
    if (state.buf.length < 4 + len) break;
    const body = state.buf.subarray(4, 4 + len).toString('utf8');
    state.buf = state.buf.subarray(4 + len);
    out.push(JSON.parse(body));
  }
  return out;
}

export function median(xs: readonly number[]): number {
  if (xs.length === 0) throw new Error('median of empty array');
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  const hi = sorted[mid] ?? 0;
  return sorted.length % 2 === 1 ? hi : ((sorted[mid - 1] ?? 0) + hi) / 2;
}

interface BenchReport {
  provider: string;
  coldMs: number;
  warmMs: number[];
  coldHostMs?: number | null;
  warmHostMs?: (number | null)[];
}

export function formatReport(r: BenchReport): string {
  const warmMedian = median(r.warmMs);
  const ratio = warmMedian === 0 ? 'n/a' : `${(r.coldMs / warmMedian).toFixed(1)}x`;
  const lines = [
    `Provider: ${r.provider}`,
    `Cold TTFT: ${Math.round(r.coldMs)}ms`,
    `Warm TTFTs: ${r.warmMs.map((ms) => `${Math.round(ms)}ms`).join(', ')}`,
    `Warm median: ${Math.round(warmMedian)}ms`,
    `Cold/warm ratio: ${ratio}`,
  ];
  const hostWarm = (r.warmHostMs ?? []).filter((x): x is number => typeof x === 'number');
  if (typeof r.coldHostMs === 'number') {
    lines.push(`Host cold TTFT: ${Math.round(r.coldHostMs)}ms`);
  }
  if (hostWarm.length > 0) {
    lines.push(`Host warm median: ${Math.round(median(hostWarm))}ms`);
  }
  return lines.join('\n');
}

// --- Runner ----------------------------------------------------------------

const N_WARM = Number(process.env['BENCH_N']) || 4;
const PROVIDER = process.env['BENCH_PROVIDER'] || 'claude';
const PROMPT = process.env['BENCH_PROMPT'] || 'translate to english: hola';

type Host = ChildProcessByStdio<Writable, Readable, null>;

interface HostFrame {
  id?: string;
  type?: string;
  message?: string;
  ttftMs?: number;
}

function spawnHost(): Host {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const host = path.resolve(here, '..', 'native-host', 'ega-host.mjs');
  return spawn(process.execPath, [host], { stdio: ['pipe', 'pipe', 'inherit'] });
}

function ttftOne(
  child: Host,
  id: string,
  provider: string,
  prompt: string,
): Promise<{ wallMs: number; hostMs: number | null }> {
  return new Promise((resolve, reject) => {
    const state: FrameParserState = { buf: Buffer.alloc(0) };
    let firstDelta: number | null = null;
    let hostTtftMs: number | null = null;
    const onData = (chunk: Buffer): void => {
      let frames: unknown[];
      try {
        frames = parseFrames(state, chunk);
      } catch (e) {
        cleanup();
        reject(e instanceof Error ? e : new Error(String(e)));
        return;
      }
      for (const f of frames) {
        if (!f || typeof f !== 'object') continue;
        const msg = f as HostFrame;
        if (msg.id !== id) continue;
        if (msg.type === 'delta' && firstDelta === null) {
          firstDelta = performance.now();
        }
        if (msg.type === 'done') {
          if (typeof msg.ttftMs === 'number') hostTtftMs = msg.ttftMs;
          cleanup();
          if (firstDelta === null) {
            reject(new Error(`request ${id}: done arrived without any delta`));
          } else {
            resolve({ wallMs: firstDelta - sentAt, hostMs: hostTtftMs });
          }
          return;
        }
        if (msg.type === 'error') {
          cleanup();
          reject(new Error(`request ${id}: ${msg.message ?? 'native error'}`));
          return;
        }
      }
    };
    const cleanup = (): void => {
      child.stdout.off('data', onData);
    };
    child.stdout.on('data', onData);

    const sentAt = performance.now();
    child.stdin.write(
      frame({
        v: 1,
        kind: 'translate',
        id,
        backend: provider,
        prompt: { system: '', user: prompt },
        stream: true,
      }),
    );
  });
}

async function main(): Promise<void> {
  const child = spawnHost();
  child.on('error', (e) => {
    console.error('host spawn failed:', e.message);
    process.exit(1);
  });

  try {
    const cold = await ttftOne(child, 'bench-cold', PROVIDER, PROMPT);
    const warmMs: number[] = [];
    const warmHostMs: (number | null)[] = [];
    for (let i = 0; i < N_WARM; i++) {
      const w = await ttftOne(child, `bench-warm-${i}`, PROVIDER, PROMPT);
      warmMs.push(w.wallMs);
      warmHostMs.push(w.hostMs);
    }
    process.stdout.write(
      formatReport({
        provider: PROVIDER,
        coldMs: cold.wallMs,
        warmMs,
        coldHostMs: cold.hostMs,
        warmHostMs,
      }) + '\n',
    );
  } finally {
    child.stdin.end();
    child.kill('SIGTERM');
  }
}

const isMain =
  !!process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  main().catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  });
}
