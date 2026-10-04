import { describe, it, expect } from 'vitest';
import { settingsSchema } from '@/shared/settings-schema';
import { objectEntries, unwrapOptional, WRAPPER_TYPES } from '@/shared/valibot-introspect';

// A required key missing from a nested object resets the whole section (settings-schema.ts#parseStoredSettings), so every nested key needs a default.

function walk(entries: Record<string, unknown>, path: string, bad: string[]): void {
  for (const [key, field] of Object.entries(entries)) {
    const node = field as { type?: string; default?: unknown };
    const here = path ? `${path}.${key}` : key;
    const optional = WRAPPER_TYPES.has(node.type ?? '');
    if (path !== '' && !optional) bad.push(here);
    const inner = objectEntries(unwrapOptional(field as never));
    if (inner) walk(inner, here, bad);
  }
}

describe('settings schema — every nested key survives a stored row that predates it', () => {
  it('has a default at every depth below the top level', () => {
    const top = objectEntries(settingsSchema);
    expect(top).toBeDefined();
    const bad: string[] = [];
    walk(top ?? {}, '', bad);
    expect(bad).toEqual([]);
  });
});
