import { describe, it, expect } from 'vitest';
import {
  NATIVE_CLI_REGISTRY,
  isKnownNativeCli,
  DEFAULT_NATIVE_CLI,
} from '@/shared/native-cli-registry';

describe('native-cli-registry', () => {
  it('lists at least claude and codex', () => {
    const ids = NATIVE_CLI_REGISTRY.map((c) => c.id);
    expect(ids).toContain('claude');
    expect(ids).toContain('codex');
  });

  it('every entry has a label', () => {
    for (const e of NATIVE_CLI_REGISTRY) {
      expect(typeof e.label).toBe('string');
      expect(e.label.length).toBeGreaterThan(0);
    }
  });

  it('isKnownNativeCli accepts registered ids and rejects unknown', () => {
    expect(isKnownNativeCli('claude')).toBe(true);
    expect(isKnownNativeCli('codex')).toBe(true);
    expect(isKnownNativeCli('not-a-real-cli')).toBe(false);
    expect(isKnownNativeCli('')).toBe(false);
    expect(isKnownNativeCli(undefined)).toBe(false);
    expect(isKnownNativeCli(42)).toBe(false);
  });

  it('DEFAULT_NATIVE_CLI is a registered id', () => {
    expect(isKnownNativeCli(DEFAULT_NATIVE_CLI)).toBe(true);
  });
});
