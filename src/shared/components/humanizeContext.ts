import type { PageContext } from '@/shared/types';

interface HumanizedEntry {
  label: string;
  value: string;
  truncated: boolean;
}

const MAX_LEN = 120;

const FIELD_ORDER: Array<{ key: keyof PageContext; label: string }> = [
  { key: 'pageTitle', label: 'Page title' },
  { key: 'pageUrl', label: 'Page URL' },
  { key: 'pageLang', label: 'Page language' },
  { key: 'pageDescription', label: 'Description' },
  { key: 'siteName', label: 'Site' },
  { key: 'headingTrail', label: 'Heading trail' },
  { key: 'beforeText', label: 'Before' },
  { key: 'afterText', label: 'After' },
];

function visualizeWhitespace(s: string): string {
  return s.replace(/\n/g, '↵').replace(/\t/g, '→');
}

function stringifyValue(v: unknown): string {
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) {
    // headingTrail: string[]. Fall back to JSON for any other arrays.
    if (v.every((x) => typeof x === 'string')) return v.join(' › ');
    return JSON.stringify(v);
  }
  if (v && typeof v === 'object') return JSON.stringify(v);
  if (v === null || v === undefined) return '';
  return String(v);
}

export function humanizeContext(ctx: PageContext): HumanizedEntry[] {
  const out: HumanizedEntry[] = [];
  const bag = ctx as Record<string, unknown>;
  for (const { key, label } of FIELD_ORDER) {
    const raw = bag[key as string];
    if (raw === undefined || raw === null || raw === '') continue;
    if (Array.isArray(raw) && raw.length === 0) continue;
    const str = stringifyValue(raw);
    if (str.length === 0) continue;
    const visible = visualizeWhitespace(str);
    const truncated = visible.length > MAX_LEN;
    const value = truncated ? visible.slice(0, MAX_LEN) + '…' : visible;
    out.push({ label, value, truncated });
  }
  return out;
}
