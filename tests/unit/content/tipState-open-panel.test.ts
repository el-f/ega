// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { openTooltip, errorTooltip, closeTooltip } from '@/content/tipState.svelte';
import { mountShadowHost, getContainer } from '@/content/shadowHost';
import { chromeMock } from '@tests/mocks/chrome';
import type { ErrCode } from '@/shared/types';

// The tooltip hands its error code to the side-panel handoff, which attaches the image only when a re-send could work.

const rect = { x: 50, y: 50, left: 50, top: 50, right: 150, bottom: 70, width: 100, height: 20 };

beforeEach(() => {
  document.body.innerHTML = '';
  document.documentElement.removeAttribute('data-ega-host-installed');
  if (!(globalThis as { ResizeObserver?: unknown }).ResizeObserver) {
    class StubResizeObserver {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
    (globalThis as unknown as { ResizeObserver: typeof StubResizeObserver }).ResizeObserver =
      StubResizeObserver;
  }
  mountShadowHost();
});

afterEach(() => {
  closeTooltip();
  document.body.innerHTML = '';
});

async function openPanelAfter(code: ErrCode): Promise<unknown> {
  const sent: unknown[] = [];
  chromeMock.runtime.sendMessage = vi.fn(async (msg: unknown) => {
    sent.push(msg);
    return { ok: true };
  });
  openTooltip({
    requestId: 'img',
    srcText: '',
    rect: { ...rect, toJSON: () => ({}) } as DOMRect,
    imageUrl: 'https://example.test/sign.png',
  });
  await Promise.resolve();
  errorTooltip('img', { code, message: 'failed' });
  await Promise.resolve();
  const btn = getContainer().querySelector<HTMLButtonElement>('[data-ega-escalate="open-panel"]');
  if (!btn) throw new Error('Open in side panel button missing');
  btn.click();
  await vi.waitFor(() => {
    expect(sent).toHaveLength(1);
  });
  return sent[0];
}

describe('Open in side panel on a failed image', () => {
  it('leaves an image the model cannot read behind', async () => {
    expect(await openPanelAfter('IMAGE_UNSUPPORTED')).toEqual({ kind: 'ui:open-sidepanel' });
  });

  it('attaches the image after a network failure', async () => {
    expect(await openPanelAfter('NETWORK')).toMatchObject({
      kind: 'ui:open-sidepanel',
      handoff: { imageDataUrl: 'https://example.test/sign.png', attachImage: true },
    });
  });
});
