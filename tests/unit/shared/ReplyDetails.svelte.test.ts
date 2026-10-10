// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import ReplyDetails from '@/shared/components/ReplyDetails.svelte';
import { aroundText, shortUrl } from '@/shared/components/reply-details';
import type { PageContext, ResultMeta } from '@/shared/types';
import { asBackendIdUnsafe } from '@/shared/brands';
import { readFileSync } from 'node:fs';

function meta(overrides: Partial<ResultMeta> = {}): ResultMeta {
  return {
    backendId: asBackendIdUnsafe('anthropic'),
    cacheHit: false,
    latencyMs: 450,
    ...overrides,
  };
}

const CONTEXT: PageContext = {
  pageTitle: 'Travel notes',
  pageUrl: 'https://example.com/forum/beirut?x=1',
  beforeText: 'The host texted me this on my first evening:',
  afterText: 'Everyone answered right away.',
  headingTrail: ['Forum', 'Beirut'],
};

function setup(props: Record<string, unknown> = {}) {
  const onClose = vi.fn();
  const onViewPrompt = vi.fn();
  const r = render(ReplyDetails, {
    props: {
      meta: meta(),
      context: CONTEXT,
      sentText: 'mar7aba, kifak?',
      taskLabel: 'Translate',
      onViewPrompt,
      surface: 'panel',
      onClose,
      ...props,
    },
  });
  return { ...r, onClose, onViewPrompt };
}

function row(container: HTMLElement, label: string): string | null {
  const dt = [...container.querySelectorAll('dt')].find((d) => d.textContent.trim() === label);
  const dd = dt?.nextElementSibling;
  return dd ? dd.textContent.replace(/\s+/g, ' ').trim() : null;
}

describe('ReplyDetails — result', () => {
  it('explains prompt-only plain answers and preserves reader issues in About', () => {
    const message = 'The model answered in plain text, so there is no confidence or language.';
    const { container } = setup({
      meta: meta({
        answerFormat: {
          spec: 'translate@1',
          checkedBy: 'prompt',
          issues: [message],
        },
      }),
    });
    expect(row(container, 'Answer format')).toBe(`Asked in the prompt ${message}`);
  });

  it('names the backend and model, the direction, and the time', () => {
    const { container } = setup({
      meta: meta({
        modelId: 'claude-haiku-4-5',
        sourceLang: 'auto',
        targetLang: 'en',
        firstTokenMs: 120,
        latencyMs: 1500,
      }),
    });
    expect(row(container, 'Answered by')).toBe('Claude Haiku 4.5 via Anthropic');
    expect(row(container, 'Languages')).toMatch(/^Auto-detect → /);
    // One unit, seconds (V5-08).
    expect(row(container, 'Time')).toBe('1.5 s (first words after 0.1 s)');
  });

  it('says a cached answer came from the cache, with no first-word time', () => {
    const { container } = setup({ meta: meta({ cacheHit: true, firstTokenMs: 5 }) });
    expect(row(container, 'Answered by')).toBe('Saved answer (from cache)');
    expect(row(container, 'Time')).toBe('0.5 s');
  });

  it('keeps a time under a tenth of a second from reading 0.0 s', () => {
    const { container } = setup({ meta: meta({ cacheHit: true, latencyMs: 30 }) });
    expect(row(container, 'Time')).toBe('0.03 s');
  });

  it('says a cache hit faster than a hundredth of a second took under 0.01 s, never 0.00 s', () => {
    const { container } = setup({ meta: meta({ cacheHit: true, latencyMs: 4 }) });
    expect(row(container, 'Time')).toBe('under 0.01 s');
  });

  it('shows every token count the provider reported, a zero cache read included', () => {
    const { container } = setup({
      meta: meta({
        inputTokens: 42,
        outputTokens: 9,
        reasoningTokens: 3,
        cacheReadTokens: 0,
        cacheWriteTokens: 7,
      }),
    });
    expect(row(container, 'Usage')).toBe('42 tokens read · 9 written (3 thinking) · 0 from cache');
  });

  // Native reports each count on its own, so one side missing must not hide the rest.
  it('shows a partial token report: input and cache read only', () => {
    const { container } = setup({ meta: meta({ inputTokens: 0, cacheReadTokens: 900 }) });
    expect(row(container, 'Usage')).toBe('0 tokens read · 900 from cache');
  });

  it('shows a partial token report: output, thinking and cache write only', () => {
    const { container } = setup({
      meta: meta({ outputTokens: 50, reasoningTokens: 20, cacheWriteTokens: 300 }),
    });
    expect(row(container, 'Usage')).toBe('50 written (20 thinking)');
  });

  it('has no Usage row when the provider reported none', () => {
    const { container } = setup();
    expect(row(container, 'Usage')).toBeNull();
  });

  it('lists the backends tried, behind a disclosure, with a readable outcome', async () => {
    const { container } = setup({
      meta: meta({
        attempts: [
          {
            backendId: asBackendIdUnsafe('anthropic'),
            status: 'error',
            code: 'NETWORK',
            latencyMs: 10,
          },
          { backendId: asBackendIdUnsafe('gemini'), status: 'ok', latencyMs: 20 },
        ],
      }),
    });
    const toggle = container.querySelector<HTMLElement>('.rd-tried .rd-disclosure');
    expect(toggle?.textContent.trim()).toBe('Backends tried (2) ▸');
    toggle?.click();
    await tick();
    const names = [...container.querySelectorAll('.rd-attempt-name')].map((e) => e.textContent);
    expect(names).toEqual(['Anthropic', 'Gemini']);
    const status = [...container.querySelectorAll('.rd-attempt-status')].map((e) => e.textContent);
    expect(status[1]).toBe('answered');
    // The error row's own title for the code: one catalog names a failure the same way everywhere.
    expect(status[0]).toBe('No connection');
  });

  it('still shows what was sent when the reply carries no result data', () => {
    const { container } = setup({ meta: undefined });
    expect(row(container, 'Answered by')).toBeNull();
    expect(row(container, 'Your text')).toBe('mar7aba, kifak?');
  });
});

describe('ReplyDetails — what was sent', () => {
  it('counts the earlier messages a side-panel reply carried', () => {
    expect(row(setup({ meta: meta({ historyTurns: 4 }) }).container, 'Earlier messages')).toBe(
      '4 from this conversation',
    );
  });

  it('says None for a side-panel reply that carried none', () => {
    expect(row(setup({ meta: meta({ historyTurns: 0 }) }).container, 'Earlier messages')).toBe(
      'None',
    );
  });

  // A reply saved before the count existed, or a cache hit, carries no count at all.
  it('says Not recorded when the reply carries no count', () => {
    expect(row(setup().container, 'Earlier messages')).toBe('Not recorded');
  });

  it('says the tooltip sends no earlier messages', () => {
    expect(row(setup({ surface: 'tooltip' }).container, 'Earlier messages')).toBe(
      'None. The tooltip does not send earlier messages.',
    );
  });

  // The panel's only h1 is the page title, so About is a level 2 section with a level 3 part (axe heading-order).
  it('heads the section at level 2 and the sent part "What was sent" at level 3', () => {
    const { container } = setup();
    expect(container.querySelector('h2.rd-title')?.textContent.trim()).toBe('About this reply');
    expect(container.querySelector('.rd-sent h3')?.textContent.trim()).toBe('What was sent');
    expect(container.querySelector('h4')).toBeNull();
  });

  // RTL text sits on the right, so the quote rule has to sit on its start side, not on the left.
  it('draws each quote rule on the start side of its text', () => {
    const { container } = setup({ change: 'make it shorter' });
    const quotes = [...container.querySelectorAll('.rd-quote')];
    expect(quotes.length).toBe(2);
    for (const q of quotes) expect(q.classList.contains('rd-rule')).toBe(true);
    const css = readFileSync('src/shared/components/ReplyDetails.svelte', 'utf8');
    expect(css).not.toMatch(/border-left|padding-left/);
    expect(css).toMatch(
      /\.rd-rule\s*\{\s*padding-inline-start:\s*var\(--space-2\);\s*border-inline-start:\s*2px solid var\(--color-border\);/,
    );
  });

  // Spec §5.7: a ghost sm button at the start of the section, not a faint bordered box on the right.
  it('puts Copy as JSON at the start, as a ghost button', () => {
    const { getByRole } = setup();
    expect(getByRole('button', { name: 'Copy as JSON' }).classList.contains('rd-action')).toBe(
      true,
    );
    const css = readFileSync('src/shared/components/ReplyDetails.svelte', 'utf8');
    expect(css).not.toMatch(/\.rd-foot\s*\{[^}]*justify-content:\s*flex-end/);
    const action = /\.rd-action\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(action).toMatch(/border:\s*1px solid transparent/);
    expect(action).toMatch(/min-block-size:\s*28px/);
  });

  it('describes an image read with the built-in image prompt', () => {
    const { container } = setup({
      image: 'ocr',
      sentText: '',
      context: null,
      onViewPrompt: undefined,
    });
    expect(row(container, 'Your text')).toBe('An image');
    expect(row(container, 'Page info')).toBe('Not sent with images');
    expect(row(container, 'Earlier messages')).toBe('None');
  });

  it('keeps the note typed with an image', () => {
    const { container } = setup({ image: 'task', sentText: 'the red sign', taskLabel: 'Explain' });
    expect(row(container, 'Your text')).toBe('An image, with the note: the red sign');
  });

  it('shows and copies page info with secrets scrubbed, as the router sends it', async () => {
    // Built at runtime so secretlint does not flag the source.
    const key = ['ghp', '0123456789abcdefABCDEF0123456789abcd'].join('_');
    const secret = `https://example.com/reset?token=${key}`;
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
    const { container, getByRole } = setup({ context: { ...CONTEXT, pageUrl: secret } });
    await fireEvent.click(getByRole('button', { name: 'Show all page info' }));
    expect(container.textContent).not.toContain(key);
    await fireEvent.click(getByRole('button', { name: 'Copy as JSON' }));
    expect(writeText.mock.calls[0]?.[0]).not.toContain(key);
  });

  it('marks the sent text inside the page text around it', () => {
    const { container } = setup();
    const around = container.querySelector('[data-ega-context-list]');
    expect(around?.querySelector('mark')?.textContent).toBe('mar7aba, kifak?');
    expect(around?.textContent).toContain('first evening:');
    expect(around?.textContent).toContain('Everyone answered');
  });

  it('opens every page field on request', async () => {
    const { container, getByRole } = setup();
    expect(container.querySelector('[data-ega-context-all]')).toBeNull();
    await fireEvent.click(getByRole('button', { name: 'Show all page info' }));
    const all = container.querySelector('[data-ega-context-all]');
    expect(all?.textContent).toContain('https://example.com/forum/beirut?x=1');
    expect(all?.textContent).toContain('Forum › Beirut');
  });

  // null also covers a restricted tab where collection failed, so it does not claim the switch was off.
  it('tells apart page info that was not sent from page info nobody recorded', () => {
    expect(
      setup({ context: null }).container.querySelector('[data-ega-context-empty]')?.textContent,
    ).toContain('None sent');
    expect(
      setup({ context: undefined }).container.querySelector('[data-ega-context-empty]')
        ?.textContent,
    ).toContain('Not recorded');
  });

  it('names the change the user typed for this version', () => {
    expect(row(setup({ change: 'make it friendlier' }).container, 'Your change')).toBe(
      'make it friendlier',
    );
    expect(row(setup().container, 'Your change')).toBeNull();
  });

  it('copies everything as JSON', async () => {
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
    const { getByRole } = setup({ meta: meta({ historyTurns: 2 }) });
    await fireEvent.click(getByRole('button', { name: 'Copy as JSON' }));
    const copied = JSON.parse(writeText.mock.calls[0]?.[0] as string) as Record<string, unknown>;
    expect(copied['sentText']).toBe('mar7aba, kifak?');
    expect((copied['result'] as ResultMeta).historyTurns).toBe(2);
    expect((copied['page'] as PageContext).pageTitle).toBe('Travel notes');
  });

  it('closes', async () => {
    const { getByRole, onClose } = setup();
    await fireEvent.click(getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe('ReplyDetails — the instructions that were sent', () => {
  const TEXT = 'You are a translator.\nKeep slang as it is.';

  it('stay folded behind a disclosure that says how long they are', async () => {
    const { container } = setup({ meta: meta({ instructions: TEXT }) });
    const toggle = container.querySelector<HTMLElement>('[data-ega-instructions] button');
    expect(toggle?.textContent.trim()).toBe('Instructions sent ▸');
    expect(container.querySelector('[data-ega-instructions]')?.textContent).toContain(
      `${TEXT.length} characters`,
    );
    expect(container.querySelector('.rd-instr')).toBeNull();
    toggle?.click();
    await tick();
    const box = container.querySelector('.rd-instr');
    expect(box?.textContent).toBe(TEXT);
    expect(box?.getAttribute('tabindex')).toBe('0');
    expect(box?.getAttribute('aria-label')).toBe('Instructions sent');
  });

  it('say where the text was cut', async () => {
    const { container } = setup({
      meta: meta({ instructions: 'x'.repeat(6000), instructionsLength: 9000 }),
    });
    container.querySelector<HTMLElement>('[data-ega-instructions] button')?.click();
    await tick();
    expect(container.textContent).toContain('Cut at 6,000 of 9,000 characters.');
  });

  it('render page-derived text as text, never as markup', async () => {
    const { container } = setup({ meta: meta({ instructions: '<img src=x onerror="alert(1)">' }) });
    container.querySelector<HTMLElement>('[data-ega-instructions] button')?.click();
    await tick();
    expect(container.querySelector('.rd-instr img')).toBeNull();
    expect(container.querySelector('.rd-instr')?.textContent).toBe(
      '<img src=x onerror="alert(1)">',
    );
  });

  it('say "Not kept" for a reply saved without them, and "Not recorded" when recording was off', async () => {
    expect(setup().container.querySelector('[data-ega-instructions]')?.textContent).toContain(
      'Not kept for this reply.',
    );
    const onOpenSettings = vi.fn();
    const off = setup({ meta: undefined, onOpenSettings, recordsDetails: false });
    expect(off.container.querySelector('[data-ega-instructions]')?.textContent).toContain(
      'Not recorded. Turn on Record request details in',
    );
    await fireEvent.click(off.getByRole('button', { name: 'Settings' }));
    expect(onOpenSettings).toHaveBeenCalledOnce();
  });

  // A handed-off answer or an old reply has no record even with the switch on; telling the user to turn it on is untrue.
  it('with the switch on, a reply with no record says only that', () => {
    const { container, queryByRole } = setup({
      meta: undefined,
      onOpenSettings: vi.fn(),
      recordsDetails: true,
    });
    const text = container.querySelector('[data-ega-instructions]')?.textContent ?? '';
    expect(text).toContain('Not recorded for this reply.');
    expect(text).not.toContain('Turn on');
    expect(queryByRole('button', { name: 'Settings' })).toBeNull();
  });

  it('a caller that does not know the switch keeps the hint', () => {
    const { container } = setup({ meta: undefined });
    expect(container.querySelector('[data-ega-instructions]')?.textContent).toContain(
      'Turn on Record request details in Settings',
    );
  });
});

describe('aroundText / shortUrl', () => {
  it('keeps the page text nearest the sent text and squashes whitespace', () => {
    const long = 'a'.repeat(300);
    const r = aroundText(
      { beforeText: `${long}\n\nclose by`, afterText: `next\tline ${long}` },
      'x',
    );
    expect(r?.before.startsWith('…')).toBe(true);
    expect(r?.before.endsWith('close by')).toBe(true);
    expect(r?.after.startsWith('next line')).toBe(true);
    expect(r?.after.endsWith('…')).toBe(true);
  });

  it('has nothing to show without text on either side', () => {
    expect(aroundText({ pageTitle: 't' }, 'x')).toBeNull();
    expect(aroundText(null, 'x')).toBeNull();
  });

  it('shortens an address to host and path', () => {
    expect(shortUrl('https://example.com/a/b?q=1#h')).toBe('example.com/a/b');
    expect(shortUrl('https://example.com/')).toBe('example.com');
    expect(shortUrl('not a url')).toBe('not a url');
  });
});
