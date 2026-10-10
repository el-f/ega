// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  openTooltip,
  closeTooltip,
  appendDelta,
  finishTooltipDirect,
} from '@/content/tipState.svelte';
import { mountShadowHost, getContainer } from '@/content/shadowHost';
import { dismissToast } from '@/content/toast';

function rect(x: number, y: number, w: number, h: number): DOMRect {
  return {
    x,
    y,
    left: x,
    top: y,
    right: x + w,
    bottom: y + h,
    width: w,
    height: h,
    toJSON: () => ({}),
  } as DOMRect;
}

const sendMessage = vi.fn();

beforeEach(() => {
  document.body.innerHTML = '';
  document.documentElement.removeAttribute('data-ega-host-installed');
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 1000 });
  if (!(globalThis as { ResizeObserver?: unknown }).ResizeObserver) {
    class StubResizeObserver {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
    (globalThis as unknown as { ResizeObserver: typeof StubResizeObserver }).ResizeObserver =
      StubResizeObserver;
  }
  sendMessage.mockReset();
  vi.stubGlobal('chrome', {
    runtime: { id: 'ega-test-id', sendMessage, openOptionsPage: vi.fn() },
    storage: { local: { set: vi.fn() } },
  });
  mountShadowHost();
});

afterEach(() => {
  closeTooltip();
  dismissToast();
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

function wraps(): NodeListOf<HTMLElement> {
  return getContainer().querySelectorAll<HTMLElement>('[data-ega-tooltip-wrap]');
}

async function openStreaming(onClose: () => void): Promise<void> {
  openTooltip({
    requestId: 'r1',
    srcText: 'hola',
    rect: rect(50, 50, 100, 20),
    clickOutsideDismiss: false,
    onClose,
  });
  appendDelta('r1', 'Hi');
  await vi.waitFor(() => {
    expect(getContainer().querySelector('[data-ega-escalate="pin"]')).not.toBeNull();
  });
}

function pin(): void {
  getContainer().querySelector<HTMLButtonElement>('[data-ega-escalate="pin"]')?.click();
}

describe('Pin to side panel from a tooltip that is still streaming', () => {
  it('hands off a finished answer without asking the side panel to generate it again', async () => {
    sendMessage.mockResolvedValue({ ok: true });
    await openStreaming(vi.fn());
    finishTooltipDirect('r1', 'Finished answer', 0.9, { explain: 'Kept notes' });
    await vi.waitFor(() => expect(getContainer().textContent).toContain('Finished answer'));
    pin();
    await vi.waitFor(() => expect(sendMessage).toHaveBeenCalled());
    expect(sendMessage.mock.calls.at(-1)?.[0]).toMatchObject({
      kind: 'ui:open-sidepanel',
      handoff: {
        sourceText: 'hola',
        response: 'Finished answer',
        explain: 'Kept notes',
      },
    });
  });
  it('ends the request, so the hidden stream is cancelled, then closes the tooltip', async () => {
    sendMessage.mockResolvedValue({ ok: true });
    const onClose = vi.fn();
    await openStreaming(onClose);

    pin();

    await vi.waitFor(() => {
      expect(wraps().length).toBe(0);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps the tooltip and says so when the worker could not open the panel', async () => {
    sendMessage.mockResolvedValue({ ok: false });
    const onClose = vi.fn();
    await openStreaming(onClose);

    pin();

    await vi.waitFor(() => {
      expect(getContainer().querySelector('[data-ega-toast-wrap]')?.textContent).toContain(
        "Ega couldn't open the side panel. Try again.",
      );
    });
    expect(wraps().length).toBe(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('treats a missing reply as a failure too', async () => {
    sendMessage.mockResolvedValue(undefined);
    const onClose = vi.fn();
    await openStreaming(onClose);

    pin();

    await vi.waitFor(() => {
      expect(getContainer().querySelector('[data-ega-toast-wrap]')).not.toBeNull();
    });
    expect(wraps().length).toBe(1);
  });
});
