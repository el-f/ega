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

/** Each shot lands in at most one feature (first-match wins). */
export function groupShotsExclusive(
  shots: string[],
  features: Feature[],
): { groups: FeatureGroup[]; unmatched: string[] } {
  const assigned = new Set<string>();
  const groups: FeatureGroup[] = features.map((feature) => {
    const owned: string[] = [];
    for (const s of shots) {
      if (assigned.has(s)) continue;
      if (matchesFeature(s, feature)) {
        owned.push(s);
        assigned.add(s);
      }
    }
    return { feature, shots: owned.sort() };
  });
  const unmatched = shots.filter((s) => !assigned.has(s)).sort();
  return { groups, unmatched };
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
