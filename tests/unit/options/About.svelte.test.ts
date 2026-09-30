// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/svelte';
import About from '@/options/tabs/About.svelte';
import { resetChromeMock } from '../../mocks/chrome';
import pkg from '../../../package.json' with { type: 'json' };

describe('About — version card', () => {
  it('renders the version row with no changelog link', async () => {
    const { container } = render(About);
    await waitFor(
      () => expect(container.querySelector('[data-ega-about-version]')).not.toBeNull(),
      { timeout: 5000 },
    );
    expect(container.querySelector('[data-ega-about-version]')?.textContent).toContain(
      `v${pkg.version}`,
    );
    expect(container.querySelector('a[href*="CHANGELOG"]')).toBeNull();
  });
});

describe('About — duplicate captureResultMeta toggle stripped', () => {
  beforeEach(() => {
    resetChromeMock();
  });

  it('does NOT render a captureResultMeta Checkbox (Diagnostics owns it)', async () => {
    const { container } = render(About);
    // Give the onMount loader time to resolve in case the toggle would re-appear gated on `s`.
    await new Promise((r) => setTimeout(r, 100));
    expect(container.querySelector('#priv-capture-result-meta')).toBeNull();
    expect(container.textContent).not.toMatch(/Keep recent translation details/i);
  });
});
