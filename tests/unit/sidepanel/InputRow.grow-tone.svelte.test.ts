// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import { readFileSync } from 'node:fs';
import InputRow from '@/sidepanel/conversation/InputRow.svelte';

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
  attachedImage: null,
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

describe('composer textarea grows with the text', () => {
  const src = readFileSync('src/sidepanel/conversation/InputRow.svelte', 'utf8');
  // Anchored: the drag-active rule names the same class one nesting level up.
  const rule = /^\s*\.ega-input-textarea \{([^}]*)\}/m.exec(src)?.[1] ?? '';

  it('uses the native content sizing, bounded at both ends', () => {
    expect(rule).toMatch(/field-sizing:\s*content/);
    expect(rule).toMatch(/min-height:\s*calc\(/);
    expect(rule).toMatch(/max-height:\s*calc\(/);
    expect(rule).toMatch(/overflow-y:\s*auto/);
  });

  it('lets a manual drag past the six-row cap', () => {
    expect(src).toMatch(/\[style\*='height'\][\s\S]{0,60}max-height:\s*none/);
  });

  it('keeps rows=2 as the pre-Chrome-123 fallback', () => {
    expect(src).toMatch(/rows="2"/);
  });
});

describe('tone select', () => {
  it('shows when the task prompt has a {{tone}} slot, whatever the task', () => {
    const { container } = render(InputRow, {
      props: { ...baseProps(), task: 'summarize' as const, usesTone: true },
    });
    expect(container.querySelector('[data-ega-tone-select]')).not.toBeNull();
  });

  it('hides for Reword when its prompt has no {{tone}} slot', () => {
    const { container } = render(InputRow, {
      props: { ...baseProps(), task: 'reword' as const, usesTone: false },
    });
    expect(container.querySelector('[data-ega-tone-select]')).toBeNull();
  });
});

describe('task chips', () => {
  it('scrolls a task set from outside into view', async () => {
    const spy = vi.spyOn(Element.prototype, 'scrollIntoView');
    const { rerender } = render(InputRow, { props: baseProps() });
    spy.mockClear();
    await rerender({ ...baseProps(), task: 'summarize' as const });
    const scrolled = spy.mock.contexts.map((el) => (el as Element).getAttribute('data-ega-task'));
    expect(scrolled).toContain('summarize');
    spy.mockRestore();
  });
});
