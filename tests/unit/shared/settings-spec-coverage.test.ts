import { describe, it, expect } from 'vitest';
import { SETTINGS_SPEC } from '@/shared/settings-spec';
import { settingsSchema } from '@/shared/settings-schema';
import { objectEntries } from '@/shared/valibot-introspect';

// Drift was gated one way only: spec → schema. This is the mirror.

const topShape = objectEntries(settingsSchema) ?? {};
const advancedShape = objectEntries(topShape['advanced']) ?? {};

const SPEC_PATHS: readonly string[] = SETTINGS_SPEC.flatMap((e) => {
  const im = e.isModified;
  if (!im) return [];
  return im.kind === 'custom' ? [...im.paths] : [im.path];
});

/** Machine state, never a control the user edits — no search entry is owed. */
const INTERNAL_KEYS: ReadonlySet<string> = new Set([
  'apiKeyEditedAt',
  'onboardingDismissed',
  'smartBubbleBannerShown',
  'bubbleFirstRunSeen',
  'inlineUndoHintShown',
  'advanced.templateVersion',
  'advanced.templateVersionAcknowledged',
  // Kept only while a prompt is too long to write the snippets into; nothing edits it.
  'advanced.snippets',
  // Kept so an older profile still loads; the right-click menu card no longer writes either.
  'imageTranslateSurface',
]);

function covered(path: string): boolean {
  if (INTERNAL_KEYS.has(path)) return true;
  const prefix = `${path}.`;
  return SPEC_PATHS.some((p) => p === path || p.startsWith(prefix));
}

describe('settings-spec — every schema key is reachable from settings search', () => {
  it('covers every top-level settings key', () => {
    const uncovered = Object.keys(topShape).filter((k) => !covered(k));
    expect(uncovered).toEqual([]);
  });

  it('covers every advanced key', () => {
    const uncovered = Object.keys(advancedShape)
      .map((k) => `advanced.${k}`)
      .filter((p) => !covered(p));
    expect(uncovered).toEqual([]);
  });

  it('the internal allowlist names only keys the schema still declares', () => {
    const stale = [...INTERNAL_KEYS].filter((p) => {
      const tail = p.startsWith('advanced.') ? p.slice('advanced.'.length) : null;
      return tail === null ? !(p in topShape) : !(tail in advancedShape);
    });
    expect(stale).toEqual([]);
  });

  it('the internal allowlist carries no key a spec entry already covers', () => {
    const redundant = [...INTERNAL_KEYS].filter((p) =>
      SPEC_PATHS.some((sp) => sp === p || sp.startsWith(`${p}.`)),
    );
    expect(redundant).toEqual([]);
  });
});
