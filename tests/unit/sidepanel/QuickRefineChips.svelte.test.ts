// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/svelte';
import QuickRefineChips from '@/sidepanel/components/QuickRefineChips.svelte';

describe('QuickRefineChips', () => {
  it('renders three fixed chips and the Refine chip', () => {
    const { container } = render(QuickRefineChips, {
      props: {
        onRefine: vi.fn(),
      },
    });
    const shorter = container.querySelector('[data-ega-refine-chip="shorter"]');
    const less = container.querySelector('[data-ega-refine-chip="less-formal"]');
    const slang = container.querySelector('[data-ega-refine-chip="keep-slang"]');
    const refine = container.querySelector('[data-ega-refine-chip="refine"]');
    expect(shorter).not.toBeNull();
    expect(less).not.toBeNull();
    expect(slang).not.toBeNull();
    expect(refine).not.toBeNull();
  });

  it('the refine field lays out by its own first strong character', async () => {
    const { container } = render(QuickRefineChips, { props: { onRefine: vi.fn() } });
    const toggle = container.querySelector<HTMLButtonElement>('[data-ega-refine-chip="refine"]');
    if (!toggle) throw new Error('refine chip missing');
    await fireEvent.click(toggle);
    await waitFor(() => {
      if (!container.querySelector('[data-ega-refine-text]')) throw new Error('field not open');
    });
    expect(container.querySelector('[data-ega-refine-text]')?.getAttribute('dir')).toBe('auto');
  });

  it('clicking Shorter emits onRefine with a request-scoped refinementBody (no rule)', async () => {
    const onRefine = vi.fn<(args: { refinementBody: string }) => boolean>(() => true);
    const { container } = render(QuickRefineChips, {
      props: {
        onRefine,
      },
    });
    const shorter = container.querySelector<HTMLButtonElement>('[data-ega-refine-chip="shorter"]');
    if (!shorter) throw new Error('shorter chip missing');
    await fireEvent.click(shorter);
    await waitFor(() => expect(onRefine).toHaveBeenCalledTimes(1));
    const arg = onRefine.mock.calls[0]?.[0];
    expect(arg?.refinementBody.toLowerCase()).toContain('shorter');
    // Ephemeral contract: no rule object — nothing to persist.
    expect(arg).not.toHaveProperty('rule');
  });

  it('Keep slang chip carries the slang-preserving refinement body', async () => {
    const onRefine = vi.fn<(args: { refinementBody: string }) => boolean>(() => true);
    const { container } = render(QuickRefineChips, {
      props: {
        onRefine,
      },
    });
    const slang = container.querySelector<HTMLButtonElement>('[data-ega-refine-chip="keep-slang"]');
    if (!slang) throw new Error('keep-slang chip missing');
    await fireEvent.click(slang);
    await waitFor(() => expect(onRefine).toHaveBeenCalledTimes(1));
    expect(onRefine.mock.calls[0]?.[0]?.refinementBody.toLowerCase()).toContain('slang');
  });

  it('Refine chip toggles aria-expanded — drives the open-state CSS', async () => {
    const { container } = render(QuickRefineChips, {
      props: {
        onRefine: vi.fn(),
      },
    });
    const refine = container.querySelector<HTMLButtonElement>('[data-ega-refine-chip="refine"]');
    if (!refine) throw new Error('refine chip missing');
    // Resting: closed.
    expect(refine.getAttribute('aria-expanded')).toBe('false');
    expect(refine.classList.contains('refine-toggle')).toBe(true);
    await fireEvent.click(refine);
    await waitFor(() => {
      expect(refine.getAttribute('aria-expanded')).toBe('true');
    });
  });

  it('clicking Refine reveals an inline free-text input (no LLM rule round-trip)', async () => {
    const { container } = render(QuickRefineChips, {
      props: {
        onRefine: vi.fn(),
      },
    });
    expect(container.querySelector('[data-ega-refine-text]')).toBeNull();
    const refine = container.querySelector<HTMLButtonElement>('[data-ega-refine-chip="refine"]');
    if (!refine) throw new Error('refine chip missing');
    await fireEvent.click(refine);
    await waitFor(() => {
      expect(container.querySelector('[data-ega-refine-text]')).not.toBeNull();
    });
  });

  // Real <button>s: keyboard-focusable and clickable by voice control.
  it('every chip is a real <button> element', () => {
    const { container } = render(QuickRefineChips, { props: { onRefine: vi.fn() } });
    const chips = container.querySelectorAll('[data-ega-refine-chip]');
    expect(chips.length).toBe(4);
    for (const chip of chips) {
      expect(chip.tagName).toBe('BUTTON');
    }
  });

  it('inline free-text Apply emits onRefine with the typed body, no rule persisted', async () => {
    const onRefine = vi.fn();
    const { container } = render(QuickRefineChips, { props: { onRefine } });
    const toggle = container.querySelector<HTMLButtonElement>('[data-ega-refine-chip="refine"]');
    if (!toggle) throw new Error('refine chip missing');
    await fireEvent.click(toggle);
    const input = await waitFor(() => {
      const el = container.querySelector<HTMLInputElement>('[data-ega-refine-text]');
      if (!el) throw new Error('refine input missing');
      return el;
    });
    await fireEvent.input(input, { target: { value: 'use pig latin' } });
    const apply = container.querySelector<HTMLButtonElement>('[data-ega-refine-apply]');
    if (!apply) throw new Error('apply button missing');
    await fireEvent.click(apply);
    await waitFor(() => expect(onRefine).toHaveBeenCalledTimes(1));
    expect(onRefine.mock.calls[0]?.[0]).toEqual({ refinementBody: 'use pig latin' });
  });
});
