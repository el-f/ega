// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render } from '@testing-library/svelte';
import NativeBackendCard from '@/options/components/NativeBackendCard.svelte';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import type { Settings } from '@/shared/types';

// Svelte tracks reads across the whole sync frame, so a helper can make an effect self-trigger.

function baseProps() {
  return {
    settings: structuredClone(DEFAULT_SETTINGS) as Settings,
    disabled: false,
    onPatch: vi.fn(),
    onPatchModel: vi.fn(),
  };
}

function healthyPort(frames: string[], replyHostVersion = 99) {
  let postedId: string | undefined;
  let replyFn: ((m: unknown) => void) | undefined;
  return {
    postMessage: vi.fn((m: unknown) => {
      postedId = (m as { id?: string }).id;
      frames.push(String((m as { kind?: string }).kind));
      if (replyFn) {
        const fn = replyFn;
        setTimeout(
          () => fn({ v: 1, id: postedId, type: 'done', hostVersion: replyHostVersion }),
          1,
        );
      }
    }),
    disconnect: vi.fn(),
    onMessage: {
      addListener: (fn: (m: unknown) => void) => {
        replyFn = fn;
      },
      removeListener: () => {},
    },
    onDisconnect: { addListener: () => {}, removeListener: () => {} },
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('NativeBackendCard — model discovery does not self-retrigger', () => {
  it('asks for the model list a bounded number of times with a healthy host', async () => {
    const frames: string[] = [];
    const connect = vi.fn(() => healthyPort(frames) as unknown as chrome.runtime.Port);
    vi.stubGlobal('chrome', {
      ...globalThis.chrome,
      runtime: { ...globalThis.chrome.runtime, connectNative: connect },
    });

    vi.useFakeTimers();
    render(NativeBackendCard, { props: baseProps() });
    await vi.advanceTimersByTimeAsync(600);

    // Each host reply is a 1 ms timer, so a self-triggering effect makes ~600 calls in this window; zero means discovery never ran at all.
    const discover = frames.filter((k) => k === 'list-models');
    expect(discover.length).toBeGreaterThanOrEqual(1);
    expect(discover.length).toBeLessThanOrEqual(3);
  });
});
