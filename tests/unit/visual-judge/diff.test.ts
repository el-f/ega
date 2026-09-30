import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { diffPct, diffPctSync } from '../../../scripts/visual-judge/diff/pixel';

function solid(width: number, height: number, r: number, g: number, b: number): Uint8Array {
  const out = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    out[i * 4] = r;
    out[i * 4 + 1] = g;
    out[i * 4 + 2] = b;
    out[i * 4 + 3] = 255;
  }
  return out;
}

describe('diffPctSync', () => {
  it('returns 0 for identical buffers', () => {
    const w = 8;
    const h = 8;
    const a = solid(w, h, 200, 200, 200);
    const b = solid(w, h, 200, 200, 200);
    expect(diffPctSync({ data: a, width: w, height: h }, { data: b, width: w, height: h })).toBe(0);
  });

  it('returns 100 when dimensions differ', () => {
    const a = solid(2, 2, 0, 0, 0);
    const b = solid(4, 4, 0, 0, 0);
    expect(diffPctSync({ data: a, width: 2, height: 2 }, { data: b, width: 4, height: 4 })).toBe(
      100,
    );
  });

  it('produces a non-zero diff for an obviously different image', () => {
    const a = solid(4, 4, 0, 0, 0);
    const b = solid(4, 4, 255, 255, 255);
    const pct = diffPctSync({ data: a, width: 4, height: 4 }, { data: b, width: 4, height: 4 });
    expect(pct).toBeGreaterThan(50);
  });
});

describe('diffPct', () => {
  async function writePng(file: string, rgb: number): Promise<void> {
    const png = new PNG({ width: 4, height: 4 });
    png.data = Buffer.from(solid(4, 4, rgb, rgb, rgb));
    await writeFile(file, PNG.sync.write(png));
  }

  it('decodes two PNG files and compares them', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'ega-vj-diff-'));
    try {
      await writePng(path.join(dir, 'a.png'), 0);
      await writePng(path.join(dir, 'b.png'), 0);
      await writePng(path.join(dir, 'c.png'), 255);
      expect(await diffPct(path.join(dir, 'a.png'), path.join(dir, 'b.png'))).toBe(0);
      expect(await diffPct(path.join(dir, 'a.png'), path.join(dir, 'c.png'))).toBeGreaterThan(50);
      await writeFile(path.join(dir, 'bad.png'), 'not a png');
      expect(await diffPct(path.join(dir, 'a.png'), path.join(dir, 'bad.png'))).toBeNull();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
