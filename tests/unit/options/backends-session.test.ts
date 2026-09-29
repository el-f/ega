import { describe, it, expect, beforeEach } from 'vitest';
import { getNhInstallOpen, setNhInstallOpen } from '@/options/tabs/_backends-session';

describe('backends-session keeps the install-panel state across tab switches', () => {
  beforeEach(() => {
    // Reset module state, as a fresh Options page load would.
    setNhInstallOpen(null as unknown as boolean);
  });

  it('starts with null (no manual choice) so callers fall through to their default', () => {
    expect(getNhInstallOpen()).toBeNull();
  });

  it('persists the user choice across getter reads (same module lifetime = same Options page)', () => {
    setNhInstallOpen(true);
    expect(getNhInstallOpen()).toBe(true);
    setNhInstallOpen(false);
    expect(getNhInstallOpen()).toBe(false);
  });

  it('switching tabs + coming back reads the same value (no reset between get calls)', () => {
    setNhInstallOpen(true);
    // The module outlives the tab component, so the value survives a remount.
    const afterRemount = getNhInstallOpen();
    expect(afterRemount).toBe(true);
  });
});
