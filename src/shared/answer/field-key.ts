import { META_KEYS } from './spec';
import { ALIASES } from './reader';

// A field under a reader alias could be read as the answer.
const RESERVED = new Set([...META_KEYS, ...ALIASES, 'explain', 'constructor', 'prototype']);
const MAX = 32;

function camel(name: string): string {
  const words =
    name
      .normalize('NFKD')
      .replace(/\p{M}/gu, '')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .match(/[a-z0-9]+/gi) ?? [];
  if (!words.some((w) => /[a-z]/i.test(w))) return '';
  const slug = words
    .map((w, i) => (i === 0 ? w.toLowerCase() : w[0]?.toUpperCase() + w.slice(1).toLowerCase()))
    .join('');
  return /^[a-z]/.test(slug) ? slug : `field${slug}`;
}

/** The key a field is stored and asked for under, built from its name and unique in the task. */
export function fieldKey(name: string, taken: readonly string[]): string {
  const free = (key: string): boolean => !RESERVED.has(key) && !taken.includes(key);
  const base = camel(name).slice(0, MAX);
  if (base === '') {
    let n = 1;
    while (!free(`field${n}`)) n++;
    return `field${n}`;
  }
  if (free(base)) return base;
  for (let n = 2; ; n++) {
    const key = base.slice(0, MAX - String(n).length) + String(n);
    if (free(key)) return key;
  }
}
