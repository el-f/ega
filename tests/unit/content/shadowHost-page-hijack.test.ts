// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type * as ShadowHostModule from '@/content/shadowHost';

const HOST_ID = 'ega-shadow-host';

// resetModules gives each test the module state of a freshly injected content script.
async function freshShadowHost(): Promise<typeof ShadowHostModule> {
  vi.resetModules();
  return import('@/content/shadowHost');
}

function plantDecoy(): HTMLDivElement {
  const decoy = document.createElement('div');
  decoy.id = HOST_ID;
  document.documentElement.appendChild(decoy);
  return decoy;
}

beforeEach(() => {
  document.documentElement.querySelectorAll(`#${HOST_ID}`).forEach((n) => n.remove());
  document.documentElement.removeAttribute('data-ega-host-installed');
});

describe('shadowHost — a page cannot hijack the UI root by claiming the host id', () => {
  it('ignores an element the page shipped with the host id', async () => {
    const decoy = plantDecoy();

    const { mountShadowHost, getShadowHostElement } = await freshShadowHost();
    const mounted = mountShadowHost();

    expect(mounted).not.toBe(decoy);
    expect(getShadowHostElement()).not.toBe(decoy);
    expect(decoy.shadowRoot).toBeNull();
  });

  it('mounts surfaces outside the decoy, in a connected tree', async () => {
    const decoy = plantDecoy();

    const { mountShadowHost, getContainer } = await freshShadowHost();
    mountShadowHost();
    const container = getContainer();

    expect(decoy.contains(container)).toBe(false);
    expect(container.isConnected).toBe(true);
  });

  it('re-mounts our own host when the page swaps a decoy in for it', async () => {
    const { mountShadowHost, getShadowHostElement, getContainer } = await freshShadowHost();
    mountShadowHost();
    getShadowHostElement()?.remove();
    const decoy = plantDecoy();

    const container = getContainer();

    expect(getShadowHostElement()).not.toBe(decoy);
    expect(decoy.contains(container)).toBe(false);
    expect(container.isConnected).toBe(true);
  });
});
