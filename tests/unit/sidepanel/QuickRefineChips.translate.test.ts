// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/svelte';
import QuickRefineChips from '@/sidepanel/components/QuickRefineChips.svelte';

describe('QuickRefineChips — translate task wiring', () => {
  it('chip click emits onRefine with a refinementBody and no persisted rule', async () => {
    const onRefine = vi.fn<(arg: { refinementBody: string }) => boolean>(() => true);
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
    expect(arg).not.toHaveProperty('rule');
  });

  it('chip body is task-agnostic — reword turn fires the same refinement text', async () => {
    const onRefine = vi.fn<(arg: { refinementBody: string }) => boolean>(() => true);
    const { container } = render(QuickRefineChips, {
      props: { onRefine },
    });
    const less = container.querySelector<HTMLButtonElement>('[data-ega-refine-chip="less-formal"]');
    if (!less) throw new Error('less-formal chip missing');
    await fireEvent.click(less);
    await waitFor(() => expect(onRefine).toHaveBeenCalledTimes(1));
    expect(onRefine.mock.calls[0]?.[0]?.refinementBody.toLowerCase()).toContain('less formal');
  });
});
