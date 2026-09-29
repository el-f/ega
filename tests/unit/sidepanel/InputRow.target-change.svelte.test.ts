// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import InputRow from '@/sidepanel/conversation/InputRow.svelte';

const baseProps = () => ({
  value: '',
  sourceLang: 'auto',
  targetLang: 'en',
  swapDisabled: false,
  task: 'translate' as const,
  tone: 'neutral' as const,
  varieties: [],
  pageContextLevel: 'minimal' as const,
  attachedImage: null,
  turns: [] as const,
  inflight: false,
  streaming: true,
  onSwap: vi.fn(),
  onTargetChange: vi.fn(),
  onContextLevelChange: vi.fn(),
  onAttachImage: vi.fn(),
  onClearAttachedImage: vi.fn(),
  onSend: vi.fn(),
  onCancel: vi.fn(),
  onToggleStreaming: vi.fn(),
});

function targetPicker(container: HTMLElement): HTMLSelectElement {
  const el = container.querySelector<HTMLSelectElement>('#sp-conv-target');
  if (!el) throw new Error('#sp-conv-target not found');
  return el;
}

describe('InputRow — onTargetChange', () => {
  it('fires with the picked value on a user change', async () => {
    const props = baseProps();
    const { container } = render(InputRow, { props });

    await fireEvent.change(targetPicker(container), { target: { value: 'fr' } });

    expect(props.onTargetChange).toHaveBeenCalledTimes(1);
    expect(props.onTargetChange).toHaveBeenCalledWith('fr');
  });

  it('stays silent when the value is set from outside', async () => {
    const props = baseProps();
    const { container, rerender } = render(InputRow, { props });

    await rerender({ ...props, targetLang: 'fr' });

    expect(targetPicker(container).value).toBe('fr');
    expect(props.onTargetChange).not.toHaveBeenCalled();
  });

  it('is optional — a change without the handler does not throw', async () => {
    const { onTargetChange: _omit, ...props } = baseProps();
    const { container } = render(InputRow, { props });

    await expect(
      fireEvent.change(targetPicker(container), { target: { value: 'fr' } }),
    ).resolves.not.toThrow();
  });
});
