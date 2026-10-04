// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import InputRow from '@/sidepanel/conversation/InputRow.svelte';
import { SHIPPED_TASK_VIEWS } from '@/shared/task-view';
import { readFileSync } from 'node:fs';

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

/** jsdom has no layout, so the strip is told how wide it is and its scroll event is fired by hand. */
function overflowStrip(el: Element, scrollLeft: number): void {
  Object.defineProperty(el, 'scrollWidth', { value: 600, configurable: true });
  Object.defineProperty(el, 'clientWidth', { value: 300, configurable: true });
  Object.defineProperty(el, 'scrollLeft', {
    value: scrollLeft,
    writable: true,
    configurable: true,
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('task strip — a clicked chip stays under the pointer', () => {
  it('scrolls the minimum distance, not to the left edge', async () => {
    const spy = vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => {});
    const props = baseProps();
    const { rerender } = render(InputRow, { props });
    spy.mockClear();
    await rerender({ ...props, task: 'reword' as const });
    await vi.waitFor(() => expect(spy).toHaveBeenCalled());
    expect(spy.mock.calls[0]?.[0]).toMatchObject({ inline: 'nearest' });
  });
});

describe('task strip — both edges are reachable', () => {
  it('offers a way back once the strip has scrolled', async () => {
    const { container } = render(InputRow, { props: baseProps() });
    const strip = container.querySelector('.ega-task-strip');
    if (!strip) throw new Error('strip not found');

    overflowStrip(strip, 0);
    await fireEvent.scroll(strip);
    expect(container.querySelector('[data-ega-strip-less]')).toBeNull();
    expect(container.querySelector('[data-ega-strip-more]')).not.toBeNull();

    overflowStrip(strip, 120);
    await fireEvent.scroll(strip);
    expect(container.querySelector('[data-ega-strip-less]')).not.toBeNull();
  });

  it('scrolls back by a screenful when the left control is used', async () => {
    const { container } = render(InputRow, { props: baseProps() });
    const strip = container.querySelector('.ega-task-strip');
    if (!strip) throw new Error('strip not found');
    const scrollBy = vi.fn();
    Object.defineProperty(strip, 'scrollBy', { value: scrollBy, configurable: true });
    overflowStrip(strip, 120);
    await fireEvent.scroll(strip);
    const less = container.querySelector('[data-ega-strip-less]');
    if (!less) throw new Error('left control not found');
    await fireEvent.click(less);
    expect(scrollBy.mock.calls[0]?.[0]?.left).toBeLessThan(0);
  });
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

  it('keeps rows=3 as the pre-Chrome-123 fallback', () => {
    expect(src).toMatch(/rows="3"/);
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

describe('task strip — a new task list re-measures the strip', () => {
  it('shows the more button when chips are added, with no scroll event', async () => {
    const only = (ids: readonly string[]) =>
      SHIPPED_TASK_VIEWS.map((v) => ({ ...v, disabled: !ids.includes(v.id) }));
    const props = { ...baseProps(), taskViews: only(['translate']) };
    const { container, rerender } = render(InputRow, { props });
    const strip = container.querySelector('.ega-task-strip');
    if (!strip) throw new Error('strip not found');
    expect(container.querySelector('[data-ega-strip-more]')).toBeNull();
    overflowStrip(strip, 0);
    await rerender({ ...props, taskViews: only(['translate', 'explain', 'summarize']) });
    await vi.waitFor(() => expect(container.querySelector('[data-ega-strip-more]')).not.toBeNull());
  });
});
