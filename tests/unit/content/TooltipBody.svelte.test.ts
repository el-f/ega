// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render } from '@testing-library/svelte';
import { readFileSync } from 'node:fs';
import TooltipBody from '@/content/tooltip/TooltipBody.svelte';
import { optionsTabForMessage } from '@/shared/error-policy';
import type { ErrCode } from '@/shared/types';

describe('TooltipBody', () => {
  it('renders <img> when imageUrl prop present', () => {
    const { container } = render(TooltipBody, {
      props: {
        body: 'A photo of a sign.',
        loading: false,
        task: 'translate',
        imageUrl: 'https://example.test/sign.png',
      },
    });
    const img = container.querySelector('img.tooltip-image-source');
    expect(img).toBeTruthy();
    expect(img?.getAttribute('src')).toBe('https://example.test/sign.png');
  });

  it('renders no <img> when imageUrl is absent', () => {
    const { container } = render(TooltipBody, {
      props: {
        body: 'hello world',
        loading: false,
        task: 'translate',
      },
    });
    expect(container.querySelector('img.tooltip-image-source')).toBeNull();
  });

  it('does not render diff spans when settled but no prior translation is supplied', () => {
    // First translation — diffAgainst absent. The body renders as plain text.
    const { container } = render(TooltipBody, {
      props: {
        body: 'Hello world',
        loading: false,
        task: 'translate',
        settled: true,
      },
    });
    expect(container.querySelector('[data-ega-diff]')).toBeNull();
    expect(container.querySelector('.body')?.textContent.trim()).toBe('Hello world');
  });

  it('renders diff spans when settled and prior differs from new', () => {
    // Re-translate scenario — explain returned a different phrasing. Diff
    // renders del + add spans for the changed words.
    const { container } = render(TooltipBody, {
      props: {
        body: 'Hi world',
        loading: false,
        task: 'translate',
        diffAgainst: 'Hello world',
        settled: true,
      },
    });
    const delSpans = container.querySelectorAll('[data-ega-diff="del"]');
    const addSpans = container.querySelectorAll('[data-ega-diff="add"]');
    expect(delSpans.length).toBeGreaterThan(0);
    expect(addSpans.length).toBeGreaterThan(0);
    // Reconstructed body still reads as the new translation.
    expect(container.querySelector('.body')?.textContent).toContain('Hi world');
  });

  it('does not render diff spans when prior equals new (identical re-translate)', () => {
    const { container } = render(TooltipBody, {
      props: {
        body: 'Hello world',
        loading: false,
        task: 'translate',
        diffAgainst: 'Hello world',
        settled: true,
      },
    });
    expect(container.querySelector('[data-ega-diff]')).toBeNull();
  });

  it('renders the "from image" marker when usedImage and an explanation are present', () => {
    const { container } = render(TooltipBody, {
      props: {
        body: 'Hello world',
        loading: false,
        task: 'explain',
        explain: 'A regional greeting.',
        usedImage: true,
      },
    });
    expect(container.querySelector('.ega-from-image')).toBeTruthy();
  });

  it('does not render the "from image" marker when usedImage is absent', () => {
    const { container } = render(TooltipBody, {
      props: {
        body: 'Hello world',
        loading: false,
        task: 'explain',
        explain: 'A regional greeting.',
      },
    });
    expect(container.querySelector('.ega-from-image')).toBeNull();
  });

  it('does not render the "from image" marker when usedImage but no explanation', () => {
    const { container } = render(TooltipBody, {
      props: {
        body: 'Hello world',
        loading: false,
        task: 'translate',
        usedImage: true,
      },
    });
    expect(container.querySelector('.ega-from-image')).toBeNull();
  });

  it('loadingLabel overrides the task gerund on the shimmer (explain-flag re-run)', () => {
    const { container } = render(TooltipBody, {
      props: {
        body: '',
        loading: true,
        task: 'translate',
        loadingLabel: 'Explaining',
      },
    });
    expect(container.querySelector('.shimmer-label')?.textContent).toBe('Explaining…');
  });

  it('shimmer falls back to the task gerund when loadingLabel is absent', () => {
    const { container } = render(TooltipBody, {
      props: {
        body: '',
        loading: true,
        task: 'translate',
      },
    });
    expect(container.querySelector('.shimmer-label')?.textContent).toBe('Translating…');
  });

  describe('diff fade leaves the clean sentence', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('flips to body-diff-faded after 4s', async () => {
      vi.useFakeTimers();
      const { container } = render(TooltipBody, {
        props: {
          body: 'Hi world',
          loading: false,
          task: 'translate',
          diffAgainst: 'Hello world',
          settled: true,
        },
      });
      expect(container.querySelector('.body-diff-faded')).toBeNull();
      vi.advanceTimersByTime(4_100);
      await Promise.resolve();
      await Promise.resolve();
      expect(container.querySelector('.body-diff-faded')).not.toBeNull();
    });

    it('shadow.css removes del spans in the faded state, so old words leave the text flow', () => {
      const css = readFileSync('src/content/shadow.css', 'utf8');
      expect(css).toMatch(/\.body-diff-faded \.diff-del\s*\{[^}]*display:\s*none/);
    });
  });

  describe('settings CTA follows the shared error policy', () => {
    function ctaFor(code: ErrCode): Element | null {
      const { container } = render(TooltipBody, {
        props: {
          body: '',
          loading: false,
          task: 'translate',
          error: { code, message: 'nope' },
          onOpenOptions: () => {},
        },
      });
      return container.querySelector('[data-ega-tooltip-error-cta]');
    }

    it('renders for every code the shared map can send to a settings tab', () => {
      for (const code of ['AUTH', 'QUOTA', 'NATIVE_NOT_INSTALLED', 'NATIVE_SPAWN_FAIL'] as const) {
        expect(optionsTabForMessage('', code), code).toBeDefined();
        expect(ctaFor(code), code).not.toBeNull();
      }
    });

    it('stays hidden for codes no setting can fix', () => {
      for (const code of ['NETWORK', 'TIMEOUT', 'PARSE', 'UNKNOWN'] as const) {
        expect(optionsTabForMessage('', code), code).toBeUndefined();
        expect(ctaFor(code), code).toBeNull();
      }
    });
  });

  it('does not render diff spans while still streaming (settled=false)', () => {
    // Streaming text shouldn't be a kaleidoscope — diff waits for terminal.
    const { container } = render(TooltipBody, {
      props: {
        body: 'Hi wo',
        loading: false,
        task: 'translate',
        diffAgainst: 'Hello world',
        settled: false,
      },
    });
    expect(container.querySelector('[data-ega-diff]')).toBeNull();
  });
});
