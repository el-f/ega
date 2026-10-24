// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { ensureShadowSheet, getShadowRoot } from '@/content/shadowHost';
import { STABLE_LABEL_CSS } from '@/content/stable-label';

afterEach(() => {
  document.getElementById('ega-shadow-host')?.remove();
});

describe('the root sheet', () => {
  it('carries the StableLabel rules, so every surface in the root keeps its widest label (R63)', () => {
    expect(getShadowRoot().querySelector('style')?.textContent).toContain(STABLE_LABEL_CSS);
  });
});

describe('ensureShadowSheet', () => {
  it('adds a lazy surface sheet to the shadow root once', () => {
    ensureShadowSheet('ega-test-sheet', '.x { color: red; }');
    ensureShadowSheet('ega-test-sheet', '.x { color: red; }');
    const sheets = getShadowRoot().querySelectorAll('#ega-test-sheet');
    expect(sheets).toHaveLength(1);
    expect(sheets[0]?.textContent).toBe('.x { color: red; }');
  });

  it('adds it again to a host the page rebuilt', () => {
    ensureShadowSheet('ega-test-sheet', '.x {}');
    document.getElementById('ega-shadow-host')?.remove();
    ensureShadowSheet('ega-test-sheet', '.x {}');
    expect(getShadowRoot().querySelector('#ega-test-sheet')).not.toBeNull();
  });
});
