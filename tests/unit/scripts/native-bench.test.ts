// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  frame,
  parseFrames,
  median,
  type FrameParserState,
  formatReport,
} from '../../../scripts/native-bench';

describe('native-bench framing', () => {
  it('frame() emits 4-byte LE length prefix + JSON body', () => {
    const buf = frame({ kind: 'ping' });
    expect(buf.length).toBe(4 + Buffer.byteLength(JSON.stringify({ kind: 'ping' }), 'utf8'));
    const len = buf.readUInt32LE(0);
    expect(len).toBe(buf.length - 4);
    expect(JSON.parse(buf.slice(4).toString('utf8'))).toEqual({ kind: 'ping' });
  });

  it('parseFrames round-trips a single frame', () => {
    const obj = { kind: 'delta', id: 'r1', text: 'hola' };
    const state: FrameParserState = { buf: Buffer.alloc(0) };
    const out = parseFrames(state, frame(obj));
    expect(out).toEqual([obj]);
    expect(state.buf.length).toBe(0);
  });

  it('parseFrames splits multi-frame chunks', () => {
    const a = { kind: 'delta', text: 'foo' };
    const b = { kind: 'delta', text: 'bar' };
    const c = { kind: 'done' };
    const combined = Buffer.concat([frame(a), frame(b), frame(c)]);
    const state: FrameParserState = { buf: Buffer.alloc(0) };
    expect(parseFrames(state, combined)).toEqual([a, b, c]);
  });

  it('parseFrames buffers split-across-chunk frames', () => {
    const obj = { kind: 'delta', text: 'hello world' };
    const full = frame(obj);
    const state: FrameParserState = { buf: Buffer.alloc(0) };
    const first = parseFrames(state, full.slice(0, 3));
    expect(first).toEqual([]);
    const second = parseFrames(state, full.slice(3, 7));
    expect(second).toEqual([]);
    const third = parseFrames(state, full.slice(7));
    expect(third).toEqual([obj]);
  });

  it('parseFrames handles header arriving before body', () => {
    const obj = { kind: 'done' };
    const full = frame(obj);
    const state: FrameParserState = { buf: Buffer.alloc(0) };
    expect(parseFrames(state, full.slice(0, 4))).toEqual([]);
    expect(parseFrames(state, full.slice(4))).toEqual([obj]);
  });

  it('parseFrames yields multiple frames when one chunk straddles them', () => {
    const a = { kind: 'delta', text: 'a' };
    const b = { kind: 'delta', text: 'b' };
    const fa = frame(a);
    const fb = frame(b);
    const state: FrameParserState = { buf: Buffer.alloc(0) };
    const partial = Buffer.concat([fa, fb.slice(0, 5)]);
    expect(parseFrames(state, partial)).toEqual([a]);
    expect(parseFrames(state, fb.slice(5))).toEqual([b]);
  });
});

describe('native-bench median', () => {
  it('returns the single value for one-element arrays', () => {
    expect(median([42])).toBe(42);
  });

  it('returns the middle element for odd-length arrays', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([10, 50, 30, 20, 40])).toBe(30);
  });

  it('averages the two middle elements for even-length arrays', () => {
    expect(median([1, 3])).toBe(2);
    expect(median([10, 20, 30, 40])).toBe(25);
  });

  it('throws on empty input', () => {
    expect(() => median([])).toThrow();
  });
});

describe('native-bench formatReport', () => {
  it('renders provider, cold, warm list, median, and ratio', () => {
    const out = formatReport({
      provider: 'claude',
      coldMs: 4800,
      warmMs: [600, 580, 610, 590],
    });
    expect(out).toContain('Provider: claude');
    expect(out).toContain('Cold TTFT: 4800ms');
    expect(out).toContain('Warm TTFTs: 600ms, 580ms, 610ms, 590ms');
    expect(out).toContain('Warm median: 595ms');
    expect(out).toMatch(/Cold\/warm ratio: 8\.\d+x/);
  });

  it('handles single-warm-sample case without ratio explosion', () => {
    const out = formatReport({ provider: 'codex', coldMs: 5000, warmMs: [1000] });
    expect(out).toContain('Provider: codex');
    expect(out).toContain('Warm median: 1000ms');
    expect(out).toContain('Cold/warm ratio: 5.0x');
  });

  it('reports n/a ratio when warm median is zero', () => {
    const out = formatReport({ provider: 'claude', coldMs: 4000, warmMs: [0] });
    expect(out).toContain('Cold/warm ratio: n/a');
  });
});
