/** Map shots to features by filename prefix. */
import type { Feature } from '../features';

export interface FeatureGroup {
  feature: Feature;
  shots: string[];
}

function nameWithoutPng(file: string): string {
  return file.endsWith('.png') ? file.slice(0, -4) : file;
}

function matchesFeature(file: string, feature: Feature): boolean {
  const stem = nameWithoutPng(file);
  // A prefix ending in '.' means an exact filename match ('popup.' matches only `popup.png`).
  return feature.shotPrefixes.some((p) => {
    if (p.endsWith('.')) return file === `${p}png` || stem === p.slice(0, -1);
    return stem.startsWith(p) || file.startsWith(p);
  });
}

export function groupShots(shots: string[], features: Feature[]): FeatureGroup[] {
  return features.map((feature) => ({
    feature,
    shots: shots.filter((s) => matchesFeature(s, feature)).sort(),
  }));
}

/** Even-sample a shot list down to `max` entries, keeping the first and last. */
export function sampleShots(shots: string[], max: number): string[] {
  if (shots.length <= max) return [...shots];
  const out: string[] = [];
  const stride = (shots.length - 1) / (max - 1);
  for (let i = 0; i < max; i++) {
    const idx = Math.round(i * stride);
    const pick = shots[idx];
    if (pick !== undefined) out.push(pick);
  }
  return Array.from(new Set(out));
}
