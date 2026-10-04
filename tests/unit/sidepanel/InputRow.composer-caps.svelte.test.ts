// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { readFileSync } from 'node:fs';
import InputRow from '@/sidepanel/conversation/InputRow.svelte';
import { MAX_SELECTION_CHARS } from '@/shared/constants';

const PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const baseProps = () => ({
  value: '',
  sourceLang: 'auto',
  targetLang: 'en',
  swapDisabled: false,
  task: 'translate' as const,
  tone: 'neutral' as const,
  usesTone: false,
  varieties: [],
  pageContextLevel: 'minimal' as const,
  attachedImage: null as string | null,
  turns: [] as const,
  inflight: false,
  streaming: true,
  onSwap: vi.fn(),
  onContextLevelChange: vi.fn(),
  onAttachImage: vi.fn(),
  onClearAttachedImage: vi.fn(),
  onSend: vi.fn(),
  onCancel: vi.fn(),
  onToggleStreaming: vi.fn(),
});

const sendButton = (c: HTMLElement) => c.querySelector<HTMLButtonElement>('button.ega-send');

describe('InputRow — text past the cap is stopped in the composer, not cut in the worker', () => {
  it('blocks Send and says why', () => {
    const { container } = render(InputRow, {
      props: { ...baseProps(), value: 'a'.repeat(MAX_SELECTION_CHARS + 1) },
    });
    const send = sendButton(container);
    expect(send?.disabled).toBe(true);
    expect(send?.getAttribute('data-tooltip')).toMatch(/Too long/);
  });

  it('blocks the keyboard send too', async () => {
    const onSend = vi.fn();
    const { container } = render(InputRow, {
      props: { ...baseProps(), value: 'a'.repeat(MAX_SELECTION_CHARS + 1), onSend },
    });
    const box = container.querySelector('textarea');
    if (!box) throw new Error('textarea not found');
    await fireEvent.keyDown(box, { key: 'Enter', ctrlKey: true });
    expect(onSend).not.toHaveBeenCalled();
  });

  it('counts down near the cap and marks the overflow', () => {
    const near = render(InputRow, {
      props: { ...baseProps(), value: 'a'.repeat(1700) },
    });
    const nearCount = near.container.querySelector('.ega-char-count');
    expect(nearCount?.textContent).toBe(`1700/${MAX_SELECTION_CHARS}`);
    expect(nearCount?.classList.contains('over')).toBe(false);
    near.unmount();

    const over = render(InputRow, {
      props: { ...baseProps(), value: 'a'.repeat(MAX_SELECTION_CHARS + 1) },
    });
    expect(over.container.querySelector('.ega-char-count')?.classList.contains('over')).toBe(true);
  });

  it('stays out of the way for ordinary input', () => {
    const { container } = render(InputRow, {
      props: { ...baseProps(), value: 'a'.repeat(100) },
    });
    expect(container.querySelector('.ega-char-count')).toBeNull();
    expect(sendButton(container)?.disabled).toBe(false);
  });
});

describe('InputRow — the Send button never promises a task an image cannot run', () => {
  it('says Translate image when the picked task cannot see an image', () => {
    const { container } = render(InputRow, {
      props: { ...baseProps(), attachedImage: PIXEL, task: 'ask' as const },
    });
    const send = sendButton(container);
    expect(send?.textContent.trim()).toBe('Translate image');
    expect(send?.getAttribute('data-tooltip')).toBe('Images support Translate and Explain');
  });

  it('keeps Explain, which the vision model does run', () => {
    const { container } = render(InputRow, {
      props: { ...baseProps(), attachedImage: PIXEL, task: 'explain' as const },
    });
    expect(sendButton(container)?.textContent.trim()).toBe('Explain');
  });

  it('leaves a text send alone', () => {
    const { container } = render(InputRow, {
      props: { ...baseProps(), value: 'hi', task: 'ask' as const },
    });
    expect(sendButton(container)?.textContent.trim()).toBe('Ask');
  });
});

describe('InputRow — disabled swap and the send tooltip', () => {
  const src = readFileSync('src/sidepanel/conversation/InputRow.svelte', 'utf8');

  it('uses the disabled tokens for swap, not opacity', () => {
    const rule = /\.ega-lang-pair \.swap:disabled \{([^}]*)\}/.exec(src)?.[1] ?? '';
    expect(rule).not.toMatch(/opacity\s*:/);
    expect(rule).toMatch(/background:\s*var\(--color-bg-disabled\)/);
    expect(rule).toMatch(/color:\s*var\(--color-fg-disabled\)/);
    expect(rule).toMatch(/border-color:\s*var\(--color-border-disabled\)/);
  });

  it('leaves ::after to the shared tooltip and draws the focus underline on ::before', () => {
    expect(src).not.toMatch(/\.ega-send(:[\w-]+)*::after/);
    expect(src).toMatch(/\.ega-send::before/);
    expect(src).toMatch(/\.ega-send:focus-visible::before/);
    const tokens = readFileSync('src/shared/tokens.css', 'utf8');
    expect(tokens).toMatch(/\[data-tooltip\]:not\(\[data-tooltip=''\]\):hover::after/);
  });

  it('marks a hot mic with a shape cue under forced colors, from the shared rule', () => {
    // The per-component block was deleted: tokens.css now rings every [aria-pressed='true'].
    expect(src).toMatch(/\.ega-mic-btn\[aria-pressed='true'\]/);
    expect(src).not.toMatch(/@media \(forced-colors: active\)/);
    const tokens = readFileSync('src/shared/tokens.css', 'utf8');
    expect(tokens).toMatch(
      /@media \(forced-colors: active\)[\s\S]*\[aria-pressed='true'\][\s\S]*outline:\s*2px solid Highlight/,
    );
  });

  it('paints the Stop button on the danger token, like the pressed mic', () => {
    const rule = /\.ega-send\.danger \{([^}]*)\}/.exec(src)?.[1] ?? '';
    expect(rule).toMatch(/color:\s*var\(--color-danger-fg\)/);
    expect(rule).toMatch(/border-color:\s*var\(--color-danger\)/);
  });

  it('marks the drop target with a shape, not just a tint', () => {
    const rule = /\.ega-input-row\.drag-active \{([^}]*)\}/.exec(src)?.[1] ?? '';
    expect(rule).toMatch(/outline:\s*2px dashed var\(--color-accent\)/);
    expect(rule).toMatch(/outline-offset:\s*-2px/);
  });

  it('keeps a disabled swap button as the rule subject', () => {
    const { container } = render(InputRow, { props: { ...baseProps(), swapDisabled: true } });
    expect(container.querySelector<HTMLButtonElement>('.ega-lang-pair .swap')?.disabled).toBe(true);
  });
});
