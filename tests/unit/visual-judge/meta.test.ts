import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { inferSurface, loadMeta } from '../../../scripts/visual-judge/loader/meta';

describe('inferSurface', () => {
  it.each([
    ['popup-default', 'popup'],
    ['sidepanel-streaming', 'sidepanel'],
    ['tooltip-loading', 'tooltip'],
    ['smart-bubble-default', 'smart-bubble'],
    ['picker-overlay-active', 'picker'],
    ['00-advanced-landing', 'options'],
    ['settings-search-empty', 'options'],
    ['subtab-data', 'options'],
    ['templates-recipes', 'templates'],
    ['rules-editor-populated', 'templates'],
    ['describe-change-result', 'templates'],
    ['per-preset-override-active', 'templates'],
    ['slot-palette-insert-open', 'templates'],
    ['page-translate-progress', 'page-translate'],
    ['inline-replace-progress', 'page-translate'],
    ['image-translate-loading', 'image-ocr'],
    ['something-random', 'unknown'],
  ])('maps %s -> %s', (name, expected) => {
    expect(inferSurface(name)).toBe(expected);
  });
});

describe('loadMeta', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'meta-test-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('reads the sidecar when present', async () => {
    await writeFile(
      path.join(dir, 'popup-default.meta.json'),
      JSON.stringify({
        surface: 'popup',
        state: 'default',
        theme: 'dark',
        expectations: ['has shortcut hint'],
      }),
    );
    const m = await loadMeta(dir, 'popup-default');
    expect(m.surface).toBe('popup');
    expect(m.theme).toBe('dark');
    expect(m.expectations).toEqual(['has shortcut hint']);
  });

  it('falls back to inference when the sidecar is missing', async () => {
    const m = await loadMeta(dir, 'popup-default');
    expect(m.surface).toBe('popup');
    expect(m.state).toBe('default');
    expect(m.theme).toBeUndefined();
  });
});
