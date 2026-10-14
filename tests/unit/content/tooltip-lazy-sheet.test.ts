// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { openTooltip, closeTooltip } from '@/content/tipState.svelte';
import { getShadowRoot } from '@/content/shadowHost';

// The tooltip's rules ride the tooltip chunk, so a page that never opens one never pays for them.

const rect = { x: 0, y: 0, left: 0, top: 0, right: 10, bottom: 10, width: 10, height: 10 };

beforeEach(() => {
  document.getElementById('ega-shadow-host')?.remove();
});

afterEach(() => {
  closeTooltip();
  document.getElementById('ega-shadow-host')?.remove();
});

describe('the tooltip sheet', () => {
  it('is injected into the shadow root when a tooltip opens, and only once', () => {
    expect(getShadowRoot().querySelector('#ega-tooltip-styles')).toBeNull();
    const open = (id: string): void =>
      openTooltip({
        requestId: id,
        srcText: 'hola',
        rect: { ...rect, toJSON: () => ({}) } as DOMRect,
      });
    open('a');
    open('b');
    expect(getShadowRoot().querySelectorAll('#ega-tooltip-styles')).toHaveLength(1);
  });

  it('is back after the page rebuilds the host', () => {
    openTooltip({
      requestId: 'a',
      srcText: 'hola',
      rect: { ...rect, toJSON: () => ({}) } as DOMRect,
    });
    document.getElementById('ega-shadow-host')?.remove();
    openTooltip({
      requestId: 'b',
      srcText: 'hola',
      rect: { ...rect, toJSON: () => ({}) } as DOMRect,
    });
    expect(getShadowRoot().querySelector('#ega-tooltip-styles')).not.toBeNull();
  });

  it('keeps tooltip rules out of the sheet every page loads', () => {
    const eager = readFileSync(resolve('src/content/shadow.css'), 'utf8');
    for (const cls of ['.tooltip', '.reply-details', '.ega-select', '.ega-icon-btn', '.shimmer']) {
      expect(eager).not.toContain(cls);
    }
  });
});
