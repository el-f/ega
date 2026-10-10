// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render } from '@testing-library/svelte';
import { readFileSync } from 'node:fs';
import TooltipBody from '@/content/tooltip/TooltipBody.svelte';
import { optionsTabForMessage } from '@/shared/error-policy';
import type { ErrCode } from '@/shared/types';

describe('TooltipBody', () => {
  it('renders snapshot list answers and labeled notes without reparsing model text', () => {
    const { container } = render(TooltipBody, {
      props: {
        body: 'First\nSecond',
        loading: false,
        task: 'custom',
        answer: {
          spec: {
            id: 'custom:old',
            version: 1,
            join: 'after-build',
            fields: [
              { key: 'answer', label: 'Answer', kind: 'list', role: 'main', required: true },
            ],
          },
          fields: { answer: ['First', 'Second'], secret: 'Never shown' },
        },
        notes: [{ key: 'points', label: 'Original label', items: ['Useful', 'Clear'] }],
      },
    });
    expect(
      [...container.querySelectorAll('.answer-main-list li')].map((li) => li.textContent),
    ).toEqual(['First', 'Second']);
    expect(container.querySelector('[data-ega-note="points"]')?.textContent).toContain(
      'Original label',
    );
    expect(container.textContent).not.toContain('Never shown');
  });
  it.each(['', 'Hello so far'])('announces a stopped reply with partial body %j', (body) => {
    const { container } = render(TooltipBody, {
      props: { body, loading: false, stopped: true, task: 'translate' },
    });
    expect(container.querySelector('[data-ega-tooltip-live]')?.textContent).toBe(
      body ? `Stopped. ${body}` : 'Stopped. No answer yet.',
    );
    expect(container.querySelector('.body')?.textContent).toContain(body || 'No answer yet.');
  });

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
    expect(container.querySelector('.answer-note-image')).toBeTruthy();
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
    expect(container.querySelector('.answer-note-image')).toBeNull();
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
    expect(container.querySelector('.answer-note-image')).toBeNull();
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

    it('tooltip.css removes del spans in the faded state, so old words leave the text flow', () => {
      const css = readFileSync('src/content/tooltip/tooltip.css', 'utf8');
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

  describe('error copy matches the side panel', () => {
    it('shows a title and a plain sentence, and keeps the provider text behind Details', () => {
      const { container } = render(TooltipBody, {
        props: {
          body: '',
          loading: false,
          task: 'translate',
          error: {
            code: 'RATE_LIMIT',
            message: [
              'The backend is busy. Wait a moment.',
              'HTTP 429 {"error":"rate_limited"}',
            ].join('\n'),
          },
        },
      });
      expect(container.querySelector('.tooltip-error-title')?.textContent).toBe(
        'Rate limit reached',
      );
      expect(container.querySelector('.tooltip-error-body')?.textContent).toContain(
        'The backend is busy. Wait a moment.',
      );
      expect(container.querySelector('.tooltip-error-body')?.textContent).not.toContain('HTTP 429');
      expect(container.querySelector('.tooltip-error-details')).toBeNull();
      // Details is controlled by the reply's one action row.
      const shown = render(TooltipBody, {
        props: {
          body: '',
          loading: false,
          task: 'translate',
          errorDetailsOpen: true,
          error: {
            code: 'RATE_LIMIT',
            message: 'Wait a moment.\nHTTP 429 {"error":"rate_limited"}',
          },
        },
      });
      expect(shown.container.querySelector('pre.tooltip-error-details')?.textContent).toContain(
        'HTTP 429',
      );
    });

    it('has no Details disclosure when the message is one sentence', () => {
      const { container } = render(TooltipBody, {
        props: {
          body: '',
          loading: false,
          task: 'translate',
          error: { code: 'NETWORK', message: 'Down.' },
        },
      });
      expect(container.querySelector('.tooltip-error-details')).toBeNull();
    });
  });

  describe('a failed image has a way out', () => {
    const failed = {
      body: '',
      loading: false,
      task: 'translate' as const,
      imageUrl: 'https://example.test/a.png',
      error: { code: 'IMAGE_UNSUPPORTED' as const, message: 'Save it and attach the file.' },
    };

    it('offers Open in side panel and wires it', async () => {
      const onOpenPanel = vi.fn();
      const { container } = render(TooltipBody, { props: { ...failed, onOpenPanel } });
      const btn = container.querySelector<HTMLButtonElement>('.tooltip-error-panel');
      expect(btn?.textContent.trim()).toBe('Open in side panel');
      btn?.click();
      expect(onOpenPanel).toHaveBeenCalledTimes(1);
    });

    it('does not offer it for a text error', () => {
      const { imageUrl: _drop, ...textError } = failed;
      const { container } = render(TooltipBody, {
        props: { ...textError, onOpenPanel: () => {} },
      });
      expect(container.querySelector('.tooltip-error-panel')).toBeNull();
    });
  });
});
