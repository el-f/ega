import { describe, it, expect } from 'vitest';
import { validateKeyCombo } from '@/shared/utils/keyCombo';

describe('validateKeyCombo', () => {
  it('rejects empty', () => {
    expect(validateKeyCombo('').ok).toBe(false);
  });

  it('rejects bare key with no modifier', () => {
    expect(validateKeyCombo('K').ok).toBe(false);
    expect(validateKeyCombo('foo').ok).toBe(false);
  });

  it('rejects trailing + (Ctrl+)', () => {
    expect(validateKeyCombo('Ctrl+').ok).toBe(false);
  });

  it('rejects unknown modifier', () => {
    const r = validateKeyCombo('Fake+K');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.toLowerCase()).toContain('unknown');
  });

  it('accepts Ctrl+Shift+L', () => {
    const r = validateKeyCombo('Ctrl+Shift+L');
    expect(r).toEqual({ ok: true, normalized: 'Ctrl+Shift+L' });
  });

  it('accepts Alt+E', () => {
    const r = validateKeyCombo('Alt+E');
    expect(r).toEqual({ ok: true, normalized: 'Alt+E' });
  });

  it('accepts Cmd+K (Mac-style)', () => {
    const r = validateKeyCombo('Cmd+K');
    expect(r).toEqual({ ok: true, normalized: 'Cmd+K' });
  });

  it('normalizes lowercase modifiers', () => {
    const r = validateKeyCombo('ctrl+shift+l');
    expect(r).toEqual({ ok: true, normalized: 'Ctrl+Shift+L' });
  });

  it('accepts named keys (Enter, Escape, F5)', () => {
    expect(validateKeyCombo('Ctrl+Enter').ok).toBe(true);
    expect(validateKeyCombo('Alt+Escape').ok).toBe(true);
    expect(validateKeyCombo('Shift+F5').ok).toBe(true);
  });

  it('rejects multi-char key that is not named', () => {
    const r = validateKeyCombo('Ctrl+Foo');
    expect(r.ok).toBe(false);
  });
});
