import { describe, it, expect, expectTypeOf } from 'vitest';
import type { Msg } from '@/shared/messages';
import { hasKnownKind } from '@/shared/messages';

describe('messages', () => {
  it('rejects payloads missing kind; accepts kind-only payloads', () => {
    expect(hasKnownKind({})).toBe(false);
    expect(hasKnownKind(null)).toBe(false);
    expect(hasKnownKind({ kind: 'translate:start' })).toBe(true);
  });

  it('rejects unknown kinds (tighter guard)', () => {
    expect(hasKnownKind({ kind: 'delete-all-data' })).toBe(false);
    expect(hasKnownKind({ kind: 123 })).toBe(false);
    expect(hasKnownKind({ kind: 'glossary:add' })).toBe(false);
    expect(hasKnownKind({ kind: 'ui:open-options' })).toBe(true);
  });

  it('accepts ega:get-page-context as a known kind', () => {
    expect(hasKnownKind({ kind: 'ega:get-page-context', level: 'rich' })).toBe(true);
    expect(hasKnownKind({ kind: 'ega:get-page-context', level: 'minimal' })).toBe(true);
    // A stale level passes the gate; the content script clamps it to 'minimal'.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(hasKnownKind({ kind: 'ega:get-page-context', level: 'off' } as any)).toBe(true);
  });

  it('narrows by kind', () => {
    // Type-check: discriminant union narrows by 'kind'.
    const buildMsg = (): Msg => ({
      kind: 'translate:chunk',
      chunk: { type: 'delta', requestId: '1', text: 'hi' },
    });
    const m = buildMsg();
    if (m.kind === 'translate:chunk') expect(m.chunk.type).toBe('delta');
  });

  it('every Msg kind round-trips through the gate (drift guard)', () => {
    // Runtime mirror of the `satisfies` check on ALL_KINDS.
    const everyKind: ReadonlyArray<Msg['kind']> = [
      'translate:start',
      'translate:chunk',
      'translate:cancel',
      'translate:cancel-all',
      'settings:update',
      'audit:append',
      'backend:probe',
      'page:translateAll',
      'ctx:translate-selection',
      'hotkey:translate',
      'picker:enter',
      'ui:open-options',
      'ui:open-sidepanel',
      'image:translate',
      'sidepanel:seed-image-translate',
      'content:image-translate-result',
      'ega:get-selection',
      'ega:get-page-context',
      'native:get-port-status',
      'native:test',
    ];
    for (const k of everyKind) {
      expect(hasKnownKind({ kind: k }), `must accept kind=${k}`).toBe(true);
    }
    expectTypeOf<Msg['kind']>().toEqualTypeOf<(typeof everyKind)[number]>();
  });
});
