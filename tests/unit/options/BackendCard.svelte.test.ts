// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, fireEvent } from '@testing-library/svelte';
import BackendCard from '@/options/components/BackendCard.svelte';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import type { Settings } from '@/shared/types';
import { asBackendIdUnsafe } from '@/shared/brands';
import { resolveBackend } from '@/shared/backends/registry';
import { chromeMock } from '@tests/mocks/chrome';
import { resetProbeNativeHostForTest } from '@/options/probeNativeHost';
import { EXPECTED_HOST_VERSION } from '@/options/nativeHostInstall';

function baseSettings(): Settings {
  // Structured clone keeps tests hermetic — any in-test mutation can't bleed
  // into DEFAULT_SETTINGS and trip a later test.
  return structuredClone(DEFAULT_SETTINGS);
}

function getDetailsFor(container: HTMLElement, backendId: string): HTMLDetailsElement {
  const el = container.querySelector(`[data-backend-id="${backendId}"]`);
  if (!(el instanceof HTMLDetailsElement)) {
    throw new TypeError(`No <details data-backend-id="${backendId}"> in container`);
  }
  return el;
}

// Let the isAvailable probe settle; it needs macrotask ticks, not just microtasks.
async function waitForProbe(): Promise<void> {
  for (let i = 0; i < 10; i += 1) {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  }
}

describe('BackendCard collapse behavior', () => {
  beforeEach(() => {
    // no shared state to reset — settings are passed via props
  });

  it('disabled backend renders collapsed', async () => {
    const { container } = render(BackendCard, {
      props: {
        id: asBackendIdUnsafe('anthropic'),
        label: 'Anthropic',
        settings: baseSettings(),
      },
    });
    await waitForProbe();
    const details = getDetailsFor(container, 'anthropic');
    expect(details.open).toBe(false);
  });

  it('enabled backend that needs setup stays collapsed until the user opens it', async () => {
    const s = baseSettings();
    s.anthropicApiKey = '';
    const { container } = render(BackendCard, {
      props: {
        id: asBackendIdUnsafe('anthropic'),
        label: 'Anthropic',
        settings: s,
      },
    });
    await waitForProbe();
    expect(container.querySelector('.be-status-needs-config')).not.toBeNull();
    expect(getDetailsFor(container, 'anthropic').open).toBe(false);
  });

  it('keeps a card open once the user opened it, even when the key flips it to ready', async () => {
    const s = baseSettings();
    s.anthropicApiKey = '';
    const { container, rerender } = render(BackendCard, {
      props: {
        id: asBackendIdUnsafe('anthropic'),
        label: 'Anthropic',
        settings: s,
      },
    });
    await waitForProbe();
    const details = getDetailsFor(container, 'anthropic');
    details.open = true;
    await fireEvent(details, new Event('toggle'));

    const withKey = baseSettings();
    withKey.anthropicApiKey = 'sk-ant-test';
    await rerender({ settings: withKey });
    await waitForProbe();
    expect(getDetailsFor(container, 'anthropic').open).toBe(true);
  });
});

describe('BackendCard key status', () => {
  it('says "Key saved" until Test passes, then "Verified" until the key changes', async () => {
    const s = baseSettings();
    s.anthropicApiKey = 'sk-ant-test';
    const backend = resolveBackend(asBackendIdUnsafe('anthropic'));
    if (!backend) throw new Error('anthropic backend not registered');
    const origAvailable = backend.isAvailable;
    const origTranslate = backend.translate;
    backend.isAvailable = async () => true;
    backend.translate = async ({ req, onChunk }) => {
      onChunk({ type: 'delta', requestId: req.id, text: 'hello' });
      onChunk({ type: 'done', requestId: req.id });
    };
    try {
      const { container, rerender } = render(BackendCard, {
        props: {
          id: asBackendIdUnsafe('anthropic'),
          label: 'Anthropic',
          settings: s,
        },
      });
      await waitForProbe();
      const pill = (): string => container.querySelector('.be-status')?.textContent.trim() ?? '';
      expect(pill()).toBe('Key saved');

      container.querySelector<HTMLButtonElement>('.be-test-btn')?.click();
      await waitForProbe();
      expect(pill()).toBe('Verified');

      await rerender({ settings: { ...s, anthropicApiKey: 'sk-ant-other' } });
      await waitForProbe();
      expect(pill()).toBe('Key saved');
    } finally {
      backend.isAvailable = origAvailable;
      backend.translate = origTranslate;
    }
  });

  it('keeps "Ready" for a backend that needs no key', async () => {
    const backend = resolveBackend(asBackendIdUnsafe('ollama'));
    if (!backend) throw new Error('ollama backend not registered');
    const origAvailable = backend.isAvailable;
    backend.isAvailable = async () => true;
    try {
      const { container } = render(BackendCard, {
        props: {
          id: asBackendIdUnsafe('ollama'),
          label: 'Ollama',
          settings: baseSettings(),
        },
      });
      await waitForProbe();
      expect(container.querySelector('.be-status')?.textContent.trim()).toBe('Ready');
    } finally {
      backend.isAvailable = origAvailable;
    }
  });
});

describe('BackendCard text-only tag', () => {
  it('omits text-only tag for native (translateImage is implemented)', () => {
    const { queryByText } = render(BackendCard, {
      props: {
        id: asBackendIdUnsafe('native'),
        label: 'Native host',
        settings: baseSettings(),
      },
    });
    expect(queryByText(/text-only/i)).toBeNull();
  });

  it('omits text-only tag for ollama (translateImage is implemented)', () => {
    const { queryByText } = render(BackendCard, {
      props: {
        id: asBackendIdUnsafe('ollama'),
        label: 'Ollama',
        settings: baseSettings(),
      },
    });
    expect(queryByText(/text-only/i)).toBeNull();
  });
});

describe('BackendCard test button label', () => {
  it('renders "Test now" on every backend card', async () => {
    const { container } = render(BackendCard, {
      props: {
        id: asBackendIdUnsafe('anthropic'),
        label: 'Anthropic',
        settings: baseSettings(),
      },
    });
    await waitForProbe();
    const btn = container.querySelector('.be-test-btn');
    expect(btn?.textContent.trim()).toBe('Test now');
  });
});

describe('BackendCard "Test now" writes an audit entry', () => {
  it('sends a backend-test entry to the SW carrying the real error code', async () => {
    const sent: unknown[] = [];
    chromeMock.runtime.sendMessage = vi.fn((m: unknown) => {
      sent.push(m);
      return Promise.resolve({ ok: true });
    });
    const s = baseSettings();
    s.anthropicApiKey = 'sk-ant-test';
    const backend = resolveBackend(asBackendIdUnsafe('anthropic'));
    if (!backend) throw new Error('anthropic backend not registered');
    const origAvailable = backend.isAvailable;
    const origTranslate = backend.translate;
    backend.isAvailable = async () => true;
    backend.translate = async ({ req, onChunk }) => {
      onChunk({ type: 'error', requestId: req.id, code: 'RATE_LIMIT', message: 'slow down' });
    };
    try {
      const { container } = render(BackendCard, {
        props: {
          id: asBackendIdUnsafe('anthropic'),
          label: 'Anthropic',
          settings: s,
        },
      });
      await waitForProbe();
      const btn = container.querySelector<HTMLButtonElement>('.be-test-btn');
      if (!btn) throw new Error('Test now button not rendered');
      btn.click();
      await waitForProbe();

      // The options page is not a writer any more: the SW owns the audit-log read-modify-write.
      const pushes = sent.filter(
        (m): m is { kind: 'audit:push'; entry: Record<string, unknown> } =>
          (m as { kind?: string }).kind === 'audit:push',
      );
      expect(pushes).toHaveLength(1);
      const entry = pushes[0]?.entry as {
        task: string;
        backend: string;
        error?: { code: string };
        userPrompt: string;
      };
      expect(entry.task).toBe('backend-test');
      expect(entry.backend).toBe('anthropic');
      // The code must survive, not collapse to UNKNOWN — the failure breakdown groups by it.
      expect(entry.error?.code).toBe('RATE_LIMIT');
      expect(entry.userPrompt.length).toBeGreaterThan(0);
    } finally {
      backend.isAvailable = origAvailable;
      backend.translate = origTranslate;
    }
  });
});

describe('BackendCard "Test now" spinner always clears', () => {
  it('stops the native spinner when the worker rejects the message', async () => {
    chromeMock.runtime.sendMessage = vi.fn((m: unknown) =>
      (m as { kind?: string }).kind === 'native:test'
        ? Promise.reject(new Error('Could not establish connection.'))
        : Promise.resolve({ ok: true }),
    );
    const s = baseSettings();
    s.nativeCli = 'claude';
    resetProbeNativeHostForTest();
    const defaultConnect = chromeMock.runtime.connectNative.getMockImplementation();
    chromeMock.runtime.connectNative.mockImplementation(() => {
      const listeners: ((m: unknown) => void)[] = [];
      return {
        onMessage: { addListener: (f: (m: unknown) => void) => listeners.push(f) },
        onDisconnect: { addListener: () => {} },
        postMessage: (m: { id?: string }) =>
          queueMicrotask(() =>
            listeners.forEach((f) =>
              f({ v: 1, id: m.id, type: 'done', hostVersion: EXPECTED_HOST_VERSION }),
            ),
          ),
        disconnect: () => {},
      } as unknown as chrome.runtime.Port;
    });
    try {
      const { container } = render(BackendCard, {
        props: {
          id: asBackendIdUnsafe('native'),
          label: 'Native host',
          settings: s,
        },
      });
      await waitForProbe();
      const btn = container.querySelector<HTMLButtonElement>('.be-test-btn');
      if (!btn) throw new Error('Test now button not rendered');
      btn.click();
      await waitForProbe();

      expect(chromeMock.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'native:test' }),
      );
      expect(btn.disabled).toBe(false);
      expect(btn.textContent.trim()).toBe('Test now');
    } finally {
      if (defaultConnect) chromeMock.runtime.connectNative.mockImplementation(defaultConnect);
    }
  });
});

describe('BackendCard native "Test now" audit row', () => {
  it('records the typed code the worker sends back, not UNKNOWN', async () => {
    const sent: unknown[] = [];
    chromeMock.runtime.sendMessage = vi.fn((m: unknown) => {
      sent.push(m);
      return (m as { kind?: string }).kind === 'native:test'
        ? Promise.resolve({
            ok: false,
            error: 'Authentication failed: login expired',
            code: 'AUTH',
          })
        : Promise.resolve({ ok: true });
    });
    const s = baseSettings();
    s.nativeCli = 'claude';
    resetProbeNativeHostForTest();
    const defaultConnect = chromeMock.runtime.connectNative.getMockImplementation();
    chromeMock.runtime.connectNative.mockImplementation(() => {
      const listeners: ((m: unknown) => void)[] = [];
      return {
        onMessage: { addListener: (f: (m: unknown) => void) => listeners.push(f) },
        onDisconnect: { addListener: () => {} },
        postMessage: (m: { id?: string }) =>
          queueMicrotask(() =>
            listeners.forEach((f) =>
              f({ v: 1, id: m.id, type: 'done', hostVersion: EXPECTED_HOST_VERSION }),
            ),
          ),
        disconnect: () => {},
      } as unknown as chrome.runtime.Port;
    });
    try {
      const { container } = render(BackendCard, {
        props: {
          id: asBackendIdUnsafe('native'),
          label: 'Native host',
          settings: s,
        },
      });
      await waitForProbe();
      const btn = container.querySelector<HTMLButtonElement>('.be-test-btn');
      if (!btn) throw new Error('Test now button not rendered');
      btn.click();
      await waitForProbe();
      const pushes = sent.filter(
        (m): m is { kind: 'audit:push'; entry: { error?: { code: string } } } =>
          (m as { kind?: string }).kind === 'audit:push',
      );
      expect(pushes).toHaveLength(1);
      expect(pushes[0]?.entry.error?.code).toBe('AUTH');
    } finally {
      if (defaultConnect) chromeMock.runtime.connectNative.mockImplementation(defaultConnect);
    }
  });
});

describe('BackendCard footer emphasis (.be-actions)', () => {
  it('styles .be-actions as a distinct footer band with top border + recessed bg', () => {
    const sfcPath = resolve(
      process.cwd(),
      'src/options/components/backend-card/BackendCardTestRow.svelte',
    );
    const source = readFileSync(sfcPath, 'utf8');
    const actionsRule = source.match(/\.be-actions\s*\{[^}]*\}/);
    expect(actionsRule, 'expected a .be-actions CSS block').not.toBeNull();
    if (!actionsRule) return;
    const body = actionsRule[0];
    expect(body).toMatch(/border-top:\s*1px\s+solid\s+var\(--color-border-subtle\)/);
    // bg-hover diverges from bg-elevated in BOTH themes (bg-sunken
    // collapses to bg-elevated in light, which would hide the band).
    expect(body).toMatch(/background:\s*var\(--color-bg-hover\)/);
  });

  it('full-bleeds .be-actions when it is the last child so the footer rounds into the card corners', () => {
    const sfcPath = resolve(
      process.cwd(),
      'src/options/components/backend-card/BackendCardTestRow.svelte',
    );
    const source = readFileSync(sfcPath, 'utf8');
    const lastChildRule = source.match(/\.be-actions:last-child\s*\{[^}]*\}/);
    expect(lastChildRule, 'expected a .be-actions:last-child CSS block').not.toBeNull();
    if (!lastChildRule) return;
    const body = lastChildRule[0];
    // Negative side margins bleed past CollapsibleCard's --space-3
    // body padding so the band runs edge to edge.
    expect(body).toMatch(/margin:\s*var\(--space-3\)\s+calc\(-1\s*\*\s*var\(--space-3\)\)/);
    expect(body).toMatch(/border-radius:\s*0\s+0\s+var\(--radius-md\)\s+var\(--radius-md\)/);
  });
});

describe('BackendCard builds the same config the router does', () => {
  it('carries the local server URL into the availability probe', async () => {
    const s = baseSettings();
    s.ollamaUrl = 'http://127.0.0.1:11500';
    const backend = resolveBackend(asBackendIdUnsafe('ollama'));
    if (!backend) throw new Error('ollama backend not registered');
    const origAvailable = backend.isAvailable;
    const seen: (string | undefined)[] = [];
    backend.isAvailable = async (cfg) => {
      seen.push(cfg.ollamaUrl);
      return true;
    };
    try {
      render(BackendCard, {
        props: {
          id: asBackendIdUnsafe('ollama'),
          label: 'Ollama',
          settings: s,
        },
      });
      await waitForProbe();
      expect(seen).not.toHaveLength(0);
      expect(seen[0]).toBe('http://127.0.0.1:11500');
    } finally {
      backend.isAvailable = origAvailable;
    }
  });

  it('resolves the effort the same way the request does', async () => {
    const s = baseSettings();
    s.anthropicApiKey = 'sk-ant-test';
    s.advanced.effort = 'high';
    const backend = resolveBackend(asBackendIdUnsafe('anthropic'));
    if (!backend) throw new Error('anthropic backend not registered');
    const origAvailable = backend.isAvailable;
    const seen: (string | undefined)[] = [];
    backend.isAvailable = async (cfg) => {
      seen.push(cfg.advanced.effort);
      return true;
    };
    try {
      render(BackendCard, {
        props: {
          id: asBackendIdUnsafe('anthropic'),
          label: 'Anthropic',
          settings: s,
        },
      });
      await waitForProbe();
      expect(seen[0]).toBe('high');
    } finally {
      backend.isAvailable = origAvailable;
    }
  });
});
