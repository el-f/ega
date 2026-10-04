// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import { render } from '@testing-library/svelte';
import BackendCard from '@/options/components/BackendCard.svelte';
import { resetProbeNativeHostForTest } from '@/options/probeNativeHost';
import { EXPECTED_HOST_VERSION } from '@/options/nativeHostInstall';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { asBackendIdUnsafe } from '@/shared/brands';
import { resetPortManagerForTest as resetPortManager } from '@/shared/cli-session/port-manager';
import type { Settings } from '@/shared/types';
import { chromeMock } from '@tests/mocks/chrome';

async function settle(): Promise<void> {
  for (let i = 0; i < 10; i += 1) {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  }
}

/** A host that answers every frame at once and records whether its port was closed. */
function answeringHost(): { ports: { disconnect: Mock }[] } {
  const ports: { disconnect: Mock }[] = [];
  chromeMock.runtime.connectNative.mockImplementation(() => {
    const listeners: ((m: unknown) => void)[] = [];
    const port = {
      name: 'ega-native-stub',
      onMessage: { addListener: (f: (m: unknown) => void) => listeners.push(f) },
      onDisconnect: { addListener: () => {} },
      postMessage: vi.fn((m: unknown) => {
        const id = (m as { id?: string }).id;
        queueMicrotask(() =>
          listeners.forEach((f) =>
            f({ v: 1, id, type: 'done', hostVersion: EXPECTED_HOST_VERSION }),
          ),
        );
      }),
      disconnect: vi.fn(),
    };
    ports.push(port);
    return port as unknown as chrome.runtime.Port;
  });
  return { ports };
}

function renderNative(patch: Partial<Settings> = {}) {
  return render(BackendCard, {
    props: {
      id: asBackendIdUnsafe('native'),
      label: 'Native host',
      settings: { ...(structuredClone(DEFAULT_SETTINGS) as Settings), ...patch },
    },
  });
}

const defaultConnect = chromeMock.runtime.connectNative.getMockImplementation();
const defaultSendMessage = chromeMock.runtime.sendMessage;

beforeEach(() => {
  resetProbeNativeHostForTest();
  resetPortManager();
  if (defaultConnect) chromeMock.runtime.connectNative.mockImplementation(defaultConnect);
  chromeMock.runtime.sendMessage = defaultSendMessage;
});

describe('BackendCard — native host', () => {
  it('closes every port its availability check opens', async () => {
    const host = answeringHost();
    renderNative();
    await settle();
    expect(host.ports.length).toBeGreaterThan(0);
    for (const p of host.ports) expect(p.disconnect).toHaveBeenCalled();
  });

  it('points an unreachable host at the install steps, not at an API key', async () => {
    const { container } = renderNative();
    await settle();
    container.querySelector<HTMLButtonElement>('.be-test-btn')?.click();
    await settle();
    const result = container.querySelector('.be-testresult')?.textContent ?? '';
    expect(result).toBe(
      'The native host did not answer. Follow the install steps above, then click Recheck.',
    );
  });

  it('tells the user what to do when the worker never answers the test', async () => {
    answeringHost();
    chromeMock.runtime.sendMessage = vi.fn(async (_msg: unknown) => undefined as never);
    const { container } = renderNative({ nativeCli: 'codex' });
    await settle();
    container.querySelector<HTMLButtonElement>('.be-test-btn')?.click();
    await settle();
    expect(chromeMock.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'native:test',
        cfg: expect.objectContaining({ nativeCli: 'codex' }),
      }),
    );
    const result = container.querySelector('.be-testresult')?.textContent ?? '';
    expect(result).toBe('No answer from the native host. Click Recheck above, then test again.');
  });
});
