import { vi } from 'vitest';
import { fireEvent, waitFor } from '@testing-library/svelte';
import type { ComposerMode } from '@/sidepanel/state/thread-view';

/** Props for a bare InputRow: an empty Translate composer with nothing attached. */
export function composerProps() {
  return {
    value: '',
    sourceLang: 'auto',
    targetLang: 'en',
    task: 'translate' as const,
    tone: 'neutral' as const,
    usesTone: false,
    varieties: [],
    pageContextLevel: 'minimal' as const,
    contextEnabled: true,
    pageInfoGoes: false,
    onOpenSettings: vi.fn(),
    attachedImage: null as string | null,
    turns: [] as const,
    inflight: false,
    mode: { kind: 'send' } as ComposerMode,
    onCancelMode: vi.fn(),
    onContextLevelChange: vi.fn(),
    onAttachImage: vi.fn(),
    onClearAttachedImage: vi.fn(),
    onSend: vi.fn(),
    onCancel: vi.fn(),
  };
}

/** Opens the composer's Next message popover (task, languages, tone, page info) if it is not open yet. */
export async function openModePopover(container: HTMLElement): Promise<void> {
  const chip = await waitFor(() => {
    const el = container.querySelector<HTMLElement>('[data-ega-mode-chip]');
    if (!el) throw new Error('mode chip not mounted');
    return el;
  });
  if (document.querySelector('[data-ega-mode-popover]') === null) await fireEvent.click(chip);
  await waitFor(() => {
    if (document.querySelector('[data-ega-mode-popover]') === null) throw new Error('not open');
  });
}
