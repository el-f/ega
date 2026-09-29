// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import AssistantTurn from '@/sidepanel/conversation/AssistantTurn.svelte';
import InputRow from '@/sidepanel/conversation/InputRow.svelte';
import { toastStore } from '@/shared/components/toastStore';
import { IMAGE_TASKS, isImageTask } from '@/shared/task-prompts';
import type { Turn } from '@/sidepanel/state/conversation';

afterEach(() => {
  vi.restoreAllMocks();
});

function doneTurn(kind: Turn['kind']): Turn {
  return {
    createdAt: 1,
    id: 'a1',
    role: 'assistant',
    kind,
    status: 'done',
    content: 'done',
    attachedToTurnId: 'u1',
  };
}

describe('refine chips and image turns', () => {
  it('a text turn offers chips', () => {
    const { container } = render(AssistantTurn, {
      props: { turn: doneTurn('translate'), onRetry: vi.fn(), onRefine: vi.fn(), isLatest: true },
    });
    expect(container.querySelector('[data-ega-refine-chip]')).not.toBeNull();
  });

  it('an explain turn that carries an image offers none: the vision arm ignores a refinement', () => {
    const { container } = render(AssistantTurn, {
      props: {
        turn: doneTurn('explain'),
        onRetry: vi.fn(),
        onRefine: vi.fn(),
        isLatest: true,
        hasImage: true,
      },
    });
    expect(container.querySelector('[data-ega-refine-chip]')).toBeNull();
  });

  it('an image-translate turn offers none', () => {
    const { container } = render(AssistantTurn, {
      props: {
        turn: doneTurn('image-translate'),
        onRetry: vi.fn(),
        onRefine: vi.fn(),
        isLatest: true,
      },
    });
    expect(container.querySelector('[data-ega-refine-chip]')).toBeNull();
  });
});

describe('the one list of tasks an image can run', () => {
  it('is translate and explain', () => {
    expect([...IMAGE_TASKS]).toEqual(['translate', 'explain']);
    expect(isImageTask('explain')).toBe(true);
    expect(isImageTask('summarize')).toBe(false);
  });
});

describe('a pasted image the browser cannot read', () => {
  it('warns instead of failing silently', async () => {
    const push = vi.spyOn(toastStore, 'push').mockImplementation(() => {});
    class FailingReader {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      error = new Error('unreadable');
      result: string | null = null;
      readAsDataURL(): void {
        queueMicrotask(() => this.onerror?.());
      }
    }
    vi.stubGlobal('FileReader', FailingReader);
    const onAttachImage = vi.fn();
    const { container } = render(InputRow, {
      props: {
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
        onContextLevelChange: vi.fn(),
        onAttachImage,
        onClearAttachedImage: vi.fn(),
        onSend: vi.fn(),
        onCancel: vi.fn(),
        onToggleStreaming: vi.fn(),
      },
    });
    const ta = container.querySelector('textarea');
    expect(ta).not.toBeNull();
    const file = new File(['x'], 'pic.png', { type: 'image/png' });
    const items = [{ kind: 'file', type: 'image/png', getAsFile: () => file }];
    const event = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent;
    Object.defineProperty(event, 'clipboardData', {
      value: { items, files: [file], getData: () => '' },
      configurable: true,
    });
    ta?.dispatchEvent(event);

    await vi.waitFor(() => expect(push).toHaveBeenCalled());
    expect(onAttachImage).not.toHaveBeenCalled();
    expect(push.mock.calls[0]?.[0]).toMatchObject({ variant: 'warning' });
    vi.unstubAllGlobals();
  });
});
