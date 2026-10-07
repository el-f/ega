// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import { render, waitFor } from '@testing-library/svelte';
import { flushAsync } from '@tests/_helpers/async';
import { resetProbeNativeHostForTest } from '@/options/probeNativeHost';
import NativeBackendCard from '@/options/components/NativeBackendCard.svelte';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import type { Settings } from '@/shared/types';
import type { PortStatus } from '@/shared/cli-session/port-manager';

function baseProps(overrides: Partial<Settings> = {}) {
  return {
    settings: { ...structuredClone(DEFAULT_SETTINGS), ...overrides } as Settings,
    disabled: false,
    onPatch: vi.fn(),
    onPatchModel: vi.fn(),
  };
}

/** A native host that answers every request as installed (it echoes the probe's id). */
function installedHost(): void {
  (chrome.runtime.connectNative as unknown as Mock).mockImplementation(() => {
    let reply: ((m: unknown) => void) | undefined;
    return {
      postMessage: vi.fn((m: { id?: string }) => {
        const fn = reply;
        if (fn) setTimeout(() => fn({ v: 1, id: m.id, type: 'done', hostVersion: 99 }), 1);
      }),
      disconnect: vi.fn(),
      onMessage: {
        addListener: (fn: (m: unknown) => void) => {
          reply = fn;
        },
        removeListener: () => {},
      },
      onDisconnect: { addListener: () => {}, removeListener: () => {} },
    };
  });
}

function mockPortStatus(status: PortStatus): void {
  // The line polls the service worker: the options page has its own port manager that always reads cold.
  (chrome.runtime.sendMessage as unknown as Mock).mockImplementation(async (msg: unknown) => {
    const m = msg as { kind?: string };
    if (m.kind === 'native:get-port-status') return { ok: true, status };
    return undefined;
  });
}

const line = (root: HTMLElement): string => root.querySelector('.nh-line')?.textContent ?? '';

/** The line starts at cold, so a test of a reply that keeps it there first waits for that reply to land. */
async function portStatusApplied(root: HTMLElement): Promise<void> {
  await waitFor(() => expect(root.querySelector('.nh-line')).not.toBeNull());
  await waitFor(() =>
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ kind: 'native:get-port-status' }),
  );
  await flushAsync();
}

describe('NativeBackendCard: how the next answer starts', () => {
  beforeEach(() => {
    resetProbeNativeHostForTest();
    delete (chrome.runtime as { lastError?: chrome.runtime.LastError }).lastError;
    vi.restoreAllMocks();
    installedHost();
  });

  it('says answers start fast when the service worker reports warm', async () => {
    mockPortStatus('warm');
    const { container } = render(NativeBackendCard, baseProps());
    await waitFor(() => expect(line(container)).toBe('The CLI is running, so answers start fast'));
  });

  it('says the first translation starts the CLI when the port never connected', async () => {
    mockPortStatus('cold');
    const { container } = render(NativeBackendCard, baseProps());
    await portStatusApplied(container);
    expect(line(container)).toBe('The first translation starts the CLI');
  });

  it('says the CLI stopped when the service worker reports disconnected', async () => {
    mockPortStatus('disconnected');
    const { container } = render(NativeBackendCard, baseProps());
    await waitFor(() =>
      expect(line(container)).toBe('The CLI stopped; the next translation starts it again'),
    );
  });

  // The host runs codex once per request and never reports a warm session, so the line would sit on Starting for good.
  it('codex says it starts once per translation instead of a port state', async () => {
    mockPortStatus('connecting');
    const { container } = render(NativeBackendCard, baseProps({ nativeCli: 'codex' }));
    await portStatusApplied(container);
    expect(line(container)).toBe('Codex starts once per translation');
  });

  it('codex still says when the CLI stopped', async () => {
    mockPortStatus('disconnected');
    const { container } = render(NativeBackendCard, baseProps({ nativeCli: 'codex' }));
    await waitFor(() =>
      expect(line(container)).toBe('The CLI stopped; the next translation starts it again'),
    );
  });

  it('says nothing about the CLI while the host is not installed', async () => {
    (chrome.runtime.connectNative as unknown as Mock).mockImplementation(() => ({
      postMessage: vi.fn(),
      disconnect: vi.fn(),
      onMessage: { addListener: () => {}, removeListener: () => {} },
      onDisconnect: {
        addListener: (fn: () => void) => setTimeout(fn, 1),
        removeListener: () => {},
      },
    }));
    mockPortStatus('warm');
    const { container } = render(NativeBackendCard, baseProps());
    await waitFor(() =>
      expect(container.querySelector('[data-testid="nh-status-pill"]')?.classList).toContain(
        'nh-missing',
      ),
    );
    expect(container.querySelector('.nh-line')).toBeNull();
  });
});
