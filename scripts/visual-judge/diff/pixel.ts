// Percent of pixels that differ. `null` means a PNG failed to decode; different sizes return 100 so the LLM sees the resize.
import { readFile } from 'node:fs/promises';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

interface Decoded {
  data: Uint8Array;
  width: number;
  height: number;
}

async function loadPng(p: string): Promise<Decoded | null> {
  try {
    const buf = await readFile(p);
    const png = PNG.sync.read(buf);
    return { data: new Uint8Array(png.data), width: png.width, height: png.height };
  } catch {
    return null;
  }
}

export async function diffPct(currentPath: string, baselinePath: string): Promise<number | null> {
  const a = await loadPng(currentPath);
  const b = await loadPng(baselinePath);
  if (!a || !b) return null;
  return diffPctSync(a, b);
}

export function diffPctSync(a: Decoded, b: Decoded): number {
  if (a.width !== b.width || a.height !== b.height) return 100;
  const total = a.width * a.height;
  const diff = pixelmatch(a.data, b.data, undefined, a.width, a.height, { threshold: 0.1 });
  return (diff / total) * 100;
}
