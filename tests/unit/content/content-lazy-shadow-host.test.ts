// @vitest-environment jsdom
// Keep this file's first assertion first: it must read the DOM before any other suite asks for a container.
import { describe, it, expect } from 'vitest';
import '@/content/index';
import { getShadowHostElement, getContainer } from '@/content/shadowHost';
import { showToast, dismissToast } from '@/content/toast';

describe('the content script mounts its shadow host on first use', () => {
  it('builds no host just from loading on a page', () => {
    expect(document.getElementById('ega-shadow-host')).toBeNull();
    expect(getShadowHostElement()).toBeNull();
  });

  it('still marks the document booted, so a boot throw stays detectable', () => {
    expect(document.documentElement.hasAttribute('data-ega-content-booted')).toBe(true);
  });

  it('mounts the host the first time a surface asks for a container', () => {
    const container = getContainer();

    expect(container.isConnected).toBe(true);
    expect(document.getElementById('ega-shadow-host')).not.toBeNull();
    expect(getShadowHostElement()?.shadowRoot).toBe(container.getRootNode());
  });

  it('renders a real surface into the lazily built host', () => {
    showToast('Ega is off for this site.');

    const wrap = getShadowHostElement()?.shadowRoot?.querySelector('[data-ega-toast-wrap]');
    expect(wrap?.textContent).toContain('Ega is off for this site.');
    dismissToast();
  });
});
