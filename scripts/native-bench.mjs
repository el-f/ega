#!/usr/bin/env node
// Cold vs warm TTFT bench for the native host. Needs the BENCH_PROVIDER CLI installed and logged in; manual only, never CI.

import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

// --- Pure helpers (exported for unit tests) --------------------------------

/** Encode an object as a Chrome native-messaging frame: 4-byte LE length + UTF-8 JSON body. */
export function frame(obj) {
  const body = Buffer.from(JSON.stringify(obj), 'utf8');
  const len = Buffer.alloc(4);
  len.writeUInt32LE(body.length, 0);
  return Buffer.concat([len, body]);
}

/**
 * Parse every complete frame in `state.buf + chunk`; a partial tail stays in `state.buf`.
 * @typedef {{ buf: Buffer }} FrameParserState
 * @param {FrameParserState} state
 * @param {Buffer} chunk
 * @returns {unknown[]}
 */
export function parseFrames(state, chunk) {
  state.buf = state.buf.length === 0 ? chunk : Buffer.concat([state.buf, chunk]);
  const out = [];
  while (state.buf.length >= 4) {
    const len = state.buf.readUInt32LE(0);
    if (state.buf.length < 4 + len) break;
    const body = state.buf.slice(4, 4 + len).toString('utf8');
    state.buf = state.buf.slice(4 + len);
    out.push(JSON.parse(body));
  }
  return out;
}

/** @param {number[]} xs */
export function median(xs) {
  if (xs.length === 0) throw new Error('median of empty array');
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * @param {{ provider: string, coldMs: number, warmMs: number[], coldHostMs?: number|null, warmHostMs?: Array<number|null> }} r
 */
export function formatReport(r) {
  const warmMedian = median(r.warmMs);
  const ratio = warmMedian === 0 ? 'n/a' : `${(r.coldMs / warmMedian).toFixed(1)}x`;
  const lines = [
    `Provider: ${r.provider}`,
    `Cold TTFT: ${Math.round(r.coldMs)}ms`,
    `Warm TTFTs: ${r.warmMs.map((ms) => `${Math.round(ms)}ms`).join(', ')}`,
    `Warm median: ${Math.round(warmMedian)}ms`,
    `Cold/warm ratio: ${ratio}`,
  ];
  const hostWarm = (r.warmHostMs ?? []).filter((x) => typeof x === 'number');
  if (typeof r.coldHostMs === 'number' || hostWarm.length > 0) {
    if (typeof r.coldHostMs === 'number') {
      lines.push(`Host cold TTFT: ${Math.round(r.coldHostMs)}ms`);
    }
    if (hostWarm.length > 0) {
      lines.push(`Host warm median: ${Math.round(median(hostWarm))}ms`);
    }
  }
  return lines.join('\n');
}

// --- Runner ----------------------------------------------------------------

const N_WARM = Number(process.env.BENCH_N) || 4;
const PROVIDER = process.env.BENCH_PROVIDER || 'claude';
const PROMPT = process.env.BENCH_PROMPT || 'translate to english: hola';

function spawnHost() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const host = path.resolve(here, '..', 'native-host', 'ega-host.mjs');
  return spawn(process.execPath, [host], { stdio: ['pipe', 'pipe', 'inherit'] });
}

function ttftOne(child, id, provider, prompt) {
  return new Promise((resolve, reject) => {
    const state = { buf: Buffer.alloc(0) };
    let firstDelta = null;
    let hostTtftMs = null;
    const onData = (chunk) => {
      let frames;
      try {
        frames = parseFrames(state, chunk);
      } catch (e) {
        cleanup();
        reject(e);
        return;
      }
      for (const f of frames) {
        if (!f || typeof f !== 'object') continue;
        const msg =
          /** @type {{ id?: string, type?: string, message?: string, ttftMs?: number }} */ (f);
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
    const cleanup = () => {
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

async function main() {
  const child = spawnHost();
  child.on('error', (e) => {
    console.error('host spawn failed:', e.message);
    process.exit(1);
  });

  try {
    const cold = await ttftOne(child, 'bench-cold', PROVIDER, PROMPT);
    const warmMs = [];
    const warmHostMs = [];
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
    try {
      child.stdin.end();
    } catch {
      /* noop */
    }
    try {
      child.kill('SIGTERM');
    } catch {
      /* noop */
    }
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
