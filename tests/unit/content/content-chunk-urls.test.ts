// @vitest-environment node
import { describe, it, expect } from 'vitest';
import config from '../../../vite.config';

// The preload helper appends <link> tags to the host page; an absolute href resolves against the host origin.

type RenderBuiltUrl = (
  filename: string,
  ctx: { hostId: string; hostType: 'js' | 'css' | 'html'; type: 'asset' | 'public'; ssr: boolean },
) => unknown;

function renderBuiltUrl(): RenderBuiltUrl {
  const fn = (config as { experimental?: { renderBuiltUrl?: RenderBuiltUrl } }).experimental
    ?.renderBuiltUrl;
  if (!fn) throw new Error('vite.config.ts sets no experimental.renderBuiltUrl');
  return fn;
}

describe('lazy content chunks resolve against the extension, not the host page', () => {
  it('a chunk dep referenced from JS is rendered relative to the importing chunk', () => {
    const out = renderBuiltUrl()('assets/tipState.svelte-abc12345.js', {
      hostId: 'assets/index-def67890.js',
      hostType: 'js',
      type: 'asset',
      ssr: false,
    });
    expect(out).toEqual({ relative: true });
  });

  it('a CSS dep referenced from JS is rendered relative too, so the blocked load never leaves the page', () => {
    const out = renderBuiltUrl()('assets/Kbd-abc12345.css', {
      hostId: 'assets/index-def67890.js',
      hostType: 'js',
      type: 'asset',
      ssr: false,
    });
    expect(out).toEqual({ relative: true });
  });

  it('html and css hosts keep the default absolute form', () => {
    for (const hostType of ['html', 'css'] as const) {
      const out = renderBuiltUrl()('assets/index-abc12345.css', {
        hostId: 'src/popup/index.html',
        hostType,
        type: 'asset',
        ssr: false,
      });
      expect(out).toBeUndefined();
    }
  });
});
