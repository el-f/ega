import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(resolve('src/options/components/ContextMenuManager.svelte'), 'utf8');

describe('ContextMenuManager stylesheet', () => {
  it('indents the row detail from the inline start, so an RTL layout mirrors it', () => {
    expect(source).toContain('padding-inline-start');
    expect(source).not.toMatch(/padding-left/);
  });
});
