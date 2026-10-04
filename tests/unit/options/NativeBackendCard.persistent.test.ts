// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import { render, waitFor } from '@testing-library/svelte';
import { flushAsync } from '@tests/_helpers/async';
import NativeBackendCard from '@/options/components/NativeBackendCard.svelte';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import type { Settings } from '@/shared/types';
import type { PortStatus } from '@/shared/cli-session/port-manager';

function baseProps(overrides: Partial<Settings> = {}) {
  return {
    settings: { ...structuredClone(DEFAULT_SETTINGS), ...overrides } as Settings,
    disabled: false,
    routeIsText: false,
    routeIsImage: false,
    onPatch: vi.fn(),
    onPatchModel: vi.fn(),
  };
}

function mockPortStatus(status: PortStatus): void {
  // Diagnostic chip polls the bg SW via chrome.runtime.sendMessage —
  // mock the reply so the badge reads the correct status.
  (chrome.runtime.sendMessage as unknown as Mock).mockImplementation(async (msg: unknown) => {
    const m = msg as { kind?: string };
    if (m.kind === 'native:get-port-status') return { ok: true, status };
    return undefined;
  });
}

const badgeText = (root: HTMLElement): string =>
  root.querySelector('.nh-status-row .ega-badge')?.textContent ?? '';

/** The chip starts at cold, so a test of a reply that keeps it there first waits for that reply to land. */
async function portStatusApplied(): Promise<void> {
  await waitFor(() =>
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ kind: 'native:get-port-status' }),
  );
  await flushAsync();
}

describe('NativeBackendCard warm/cold badge', () => {
  beforeEach(() => {
    delete (chrome.runtime as { lastError?: chrome.runtime.LastError }).lastError;
    vi.restoreAllMocks();
  });

  it('renders the warm badge when bg SW reports warm', async () => {
    mockPortStatus('warm');
    const { container } = render(NativeBackendCard, baseProps());
    await waitFor(() => expect(badgeText(container)).toMatch(/warm/i));
    const badge = container.querySelector('.nh-status-row .ega-badge');
    expect(badge?.classList.contains('variant-success')).toBe(true);
    expect(badge?.textContent ?? '').toMatch(/warm — fast/i);
  });

  it('renders the cold badge when the port has never connected', async () => {
    mockPortStatus('cold');
    const { container } = render(NativeBackendCard, baseProps());
    await portStatusApplied();
    const badge = container.querySelector('.nh-status-row .ega-badge');
    expect(badge?.textContent ?? '').toMatch(/cold — the first translation starts the cli/i);
  });

  it('renders the disconnected badge when the bg SW reports disconnected', async () => {
    mockPortStatus('disconnected');
    const { container } = render(NativeBackendCard, baseProps());
    await waitFor(() => expect(badgeText(container)).toMatch(/disconnected/i));
    const badge = container.querySelector('.nh-status-row .ega-badge');
    expect(badge?.textContent ?? '').toMatch(/disconnected/i);
  });

  // The host runs codex once per request and never reports a warm session, so the port pill would sit on Connecting… for good.
  it('codex shows a per-process chip instead of the port pill', async () => {
    mockPortStatus('connecting');
    const { container } = render(NativeBackendCard, baseProps({ nativeCli: 'codex' }));
    await portStatusApplied();
    const badge = container.querySelector('.nh-status-row .ega-badge');
    expect(badge?.classList.contains('variant-muted')).toBe(true);
    expect(badge?.textContent ?? '').toMatch(/one process per translation/i);
    expect(badge?.textContent ?? '').not.toMatch(/connecting/i);
  });

  it('codex still shows the disconnected pill', async () => {
    mockPortStatus('disconnected');
    const { container } = render(NativeBackendCard, baseProps({ nativeCli: 'codex' }));
    await waitFor(() => expect(badgeText(container)).toMatch(/disconnected/i));
  });
});
