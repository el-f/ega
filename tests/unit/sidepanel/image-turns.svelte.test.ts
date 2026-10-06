// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import AssistantTurn from '@/sidepanel/conversation/AssistantTurn.svelte';
import { openMenu } from './_reply';
import InputRow from '@/sidepanel/conversation/InputRow.svelte';
import { composerProps } from './_composer';
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

describe('the Refine menu and image turns', () => {
  it('a text turn offers its presets', async () => {
    const { container } = render(AssistantTurn, {
      props: { turn: doneTurn('translate'), onRetry: vi.fn(), onRefine: vi.fn(), isLatest: true },
    });
    await openMenu(container, 'refine');
    expect(document.querySelector('[data-ega-refine-preset]')).not.toBeNull();
  });

  it('an explain turn that carries an image offers only languages: the vision arm ignores a refinement', async () => {
    const { container } = render(AssistantTurn, {
      props: {
        turn: doneTurn('explain'),
        onRetry: vi.fn(),
        onRefine: vi.fn(),
        isLatest: true,
        hasImage: true,
      },
    });
    await openMenu(container, 'refine');
    expect(document.querySelector('[data-ega-refine-preset]')).toBeNull();
    expect(document.querySelector('[data-ega-describe-change]')).toBeNull();
    expect(document.querySelector('[data-ega-translate-into-other]')).not.toBeNull();
  });

  it('an image-translate turn offers only languages', async () => {
    const { container } = render(AssistantTurn, {
      props: {
        turn: doneTurn('image-translate'),
        onRetry: vi.fn(),
        onRefine: vi.fn(),
        isLatest: true,
      },
    });
    await openMenu(container, 'refine');
    expect(document.querySelector('[data-ega-refine-preset]')).toBeNull();
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
      props: { ...composerProps(), onAttachImage },
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
