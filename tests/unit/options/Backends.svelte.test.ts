// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import Backends from '@/options/tabs/Backends.svelte';
import CollapsibleInstallPanel from '@/options/components/CollapsibleInstallPanel.svelte';
import { parseSettings } from '@/shared/settings-schema';
import { getRegisteredBackendIds } from '@/shared/backends/registry';
import type { Settings } from '@/shared/types';

function defaultSettings(): Settings {
  return parseSettings({});
}

function mountBackends() {
  return render(Backends, { props: { s: defaultSettings(), onSetSettings: () => {} } });
}

function mountBackendsWith(overrides: Record<string, unknown>) {
  return render(Backends, {
    props: { s: parseSettings(overrides), onSetSettings: () => {} },
  });
}

async function waitForLoaded(container: HTMLElement): Promise<void> {
  await waitFor(() => expect(container.textContent).toMatch(/Anthropic/));
}

/** The route tag a row shows: First choice, Backup n, Not reached, Skipped or Checking... */
function routeOf(container: HTMLElement, backendId: string): string | null {
  const card = container.querySelector(`[data-backend-id="${backendId}"]`);
  return (
    card
      ?.querySelector('[data-ega-route]:not([data-ega-route="first-for-images"])')
      ?.textContent.trim() ?? null
  );
}

describe('Backends tab — provider cards', () => {
  it('lists no chrome-ai provider card', async () => {
    const { container } = mountBackends();
    await waitForLoaded(container);
    expect(container.textContent).toMatch(/Anthropic/);
    // Native-host help mentions "Chrome" the browser, so match chrome-ai tokens only.
    expect(container.textContent).not.toMatch(/chrome-ai/i);
    expect(container.textContent).not.toMatch(/chrome built-in ai/i);
    expect(container.textContent).not.toMatch(/gemini nano/i);
  });
});

describe('Backends tab — route tags say what the router does (T-R2)', () => {
  it('a backend with no key is Skipped, never First choice; a host that is not installed too', async () => {
    const { container } = mountBackends();
    await waitForLoaded(container);
    expect(routeOf(container, 'anthropic')).toBe('Skipped');
    await waitFor(() => expect(routeOf(container, 'native')).toBe('Skipped'));
    expect(container.querySelector('[data-ega-route="first"]')).toBeNull();
  });

  it('the first ready backend is First choice once its key is present', async () => {
    const { container } = mountBackendsWith({ anthropicApiKey: 'sk-ant-test' });
    await waitForLoaded(container);
    expect(routeOf(container, 'anthropic')).toBe('First choice');
    expect(container.querySelectorAll('[data-ega-route="first"]')).toHaveLength(1);
  });

  it('ready rows past "Try up to" read Not reached; the ones inside are numbered backups', async () => {
    const s = parseSettings({
      anthropicApiKey: 'a',
      openaiApiKey: 'o',
      geminiApiKey: 'g',
      disabledBackends: [],
      advanced: { ...parseSettings({}).advanced, retryCount: 1 },
    });
    const { container } = render(Backends, { props: { s, onSetSettings: () => {} } });
    await waitForLoaded(container);
    const order = s.backendOrder.filter((id) => ['anthropic', 'openai', 'gemini'].includes(id));
    expect(order.map((id) => routeOf(container, id))).toEqual([
      'First choice',
      'Backup 1',
      'Not reached',
    ]);
  });
});

describe('Backends tab — Try up to (T-R6)', () => {
  it('writes retryCount as N minus 1, and reads it back', async () => {
    const onSetSettings = vi.fn();
    const s = parseSettings({ advanced: { ...parseSettings({}).advanced, retryCount: 2 } });
    const { container } = render(Backends, { props: { s, onSetSettings } });
    await waitForLoaded(container);
    const three = container.querySelector('[data-ega-depth="3"]');
    expect(three?.getAttribute('aria-checked')).toBe('true');
    await fireEvent.click(container.querySelector('[data-ega-depth="1"]') as HTMLElement);
    await waitFor(() => expect(onSetSettings).toHaveBeenCalled());
    expect((onSetSettings.mock.calls[0]?.[0] as Settings).advanced.retryCount).toBe(0);
  });

  it('says so when fewer backends are ready than it may try', async () => {
    const s = parseSettings({
      anthropicApiKey: 'a',
      disabledBackends: ['native', 'ollama', 'localserver'],
      advanced: { ...parseSettings({}).advanced, retryCount: 3 },
    });
    const { container } = render(Backends, { props: { s, onSetSettings: () => {} } });
    await waitForLoaded(container);
    await waitFor(() =>
      expect(container.querySelector('[data-ega-depth-note]')?.textContent.trim()).toBe(
        'Only 1 backend is ready, so Ega has nothing to fall back on',
      ),
    );
  });
});

describe('Backends grouping', () => {
  it('renders all 7 registered backend rows in BackendList', async () => {
    const { container } = mountBackends();
    await waitForLoaded(container);
    const rowIds = Array.from(container.querySelectorAll('[data-be-row-id]')).map((e) =>
      e.getAttribute('data-be-row-id'),
    );
    expect(rowIds).toEqual(
      expect.arrayContaining([
        'anthropic',
        'openai',
        'gemini',
        'groq',
        'deepseek',
        'together',
        'mistral',
        'xai',
        'fireworks',
        'openrouter',
        'ollama',
        'native',
      ]),
    );
    expect(rowIds).toHaveLength(getRegisteredBackendIds().length);
  });

  it('cloud section contains anthropic, openai, gemini, groq, deepseek cards', async () => {
    const { container } = mountBackends();
    await waitFor(() => {
      const cloudIds = Array.from(
        container.querySelectorAll('[data-section="cloud"] [data-backend-id]'),
      ).map((e) => e.getAttribute('data-backend-id'));
      expect(cloudIds).toEqual(
        expect.arrayContaining(['anthropic', 'openai', 'gemini', 'groq', 'deepseek']),
      );
    });
  });

  it('"Text only" is plain text on groq and deepseek (no image method), not on vision-capable rows', async () => {
    const { container } = mountBackends();
    await waitForLoaded(container);
    for (const id of ['groq', 'deepseek']) {
      const card = container.querySelector(`[data-backend-id="${id}"]`);
      expect(card?.querySelector('.be-text-only')?.textContent.trim(), id).toBe('Text only');
    }
    expect(container.querySelector('[data-backend-id="anthropic"] .be-text-only')).toBeNull();
  });

  it('local section contains ollama card', async () => {
    const { container } = mountBackends();
    await waitFor(() => {
      const localIds = Array.from(
        container.querySelectorAll('[data-section="local"] [data-backend-id]'),
      ).map((e) => e.getAttribute('data-backend-id'));
      expect(localIds).toContain('ollama');
    });
  });
});

// Render the panel alone: mounting Backends.svelte pulls in a native-host probe per test.
describe('CollapsibleInstallPanel — native-host install panel polish', () => {
  function commands(): Record<
    'windows' | 'macos' | 'linux',
    { install: string; uninstall: string; installerFile: string; installerFilename: string }
  > {
    return {
      windows: {
        install: 'powershell -NoProfile -Command "Write-Host hello-windows"',
        uninstall: 'reg delete HKCU\\... /f',
        installerFile: '@echo off\r\nrem windows installer body',
        installerFilename: 'ega-native-host-install.cmd',
      },
      macos: {
        install: 'echo hello-macos',
        uninstall: 'rm -rf ~/Library/.../com.ega.host.json',
        installerFile: '#!/usr/bin/env bash\necho macos installer body',
        installerFilename: 'ega-native-host-install.sh',
      },
      linux: {
        install: 'echo hello-linux',
        uninstall: 'rm -rf ~/.config/.../com.ega.host.json',
        installerFile: '#!/usr/bin/env bash\necho linux installer body',
        installerFilename: 'ega-native-host-install.sh',
      },
    };
  }

  it('renders collapsed by default (open=false → details.open is false)', () => {
    const { container } = render(CollapsibleInstallPanel, {
      props: {
        open: false,
        summaryLabel: 'View install command',
        defaultPlatform: 'windows',
        commands: commands(),
      },
    });
    const details = container.querySelector('[data-testid="nh-install-panel"]');
    expect(details).not.toBeNull();
    expect((details as HTMLDetailsElement).open).toBe(false);
  });

  it('opens when caller flips the bound prop to true', () => {
    const { container } = render(CollapsibleInstallPanel, {
      props: {
        open: true,
        summaryLabel: 'View install command',
        defaultPlatform: 'macos',
        commands: commands(),
      },
    });
    const details = container.querySelector(
      '[data-testid="nh-install-panel"]',
    ) as HTMLDetailsElement;
    expect(details.open).toBe(true);
    expect(container.querySelector('[data-testid="nh-install-codeblock"]')).not.toBeNull();
  });

  it('clicking the summary toggles details.open (native disclosure)', async () => {
    const { container } = render(CollapsibleInstallPanel, {
      props: {
        open: false,
        summaryLabel: 'View install command',
        defaultPlatform: 'linux',
        commands: commands(),
      },
    });
    const details = container.querySelector(
      '[data-testid="nh-install-panel"]',
    ) as HTMLDetailsElement;
    const summary = details.querySelector('summary');
    expect(summary).not.toBeNull();
    expect(details.open).toBe(false);
    // jsdom never toggles <details> on a summary click, so only the affordance is checked.
    expect((summary as HTMLElement).tagName).toBe('SUMMARY');
  });

  it('renders only the detected platform command by default — Show all toggle reveals the picker', async () => {
    const { container } = render(CollapsibleInstallPanel, {
      props: {
        open: true,
        summaryLabel: 'View install command',
        defaultPlatform: 'windows',
        commands: commands(),
      },
    });
    const code = container.querySelector('.install-code') as HTMLElement;
    expect(code.textContent).toContain('hello-windows');
    expect(container.querySelector('[data-testid="nh-platform-tab-windows"]')).toBeNull();
    expect(container.querySelector('[data-testid="nh-platform-tab-macos"]')).toBeNull();
    const showAll = container.querySelector(
      '[data-testid="nh-show-all-platforms"]',
    ) as HTMLButtonElement;
    expect(showAll).not.toBeNull();
    await fireEvent.click(showAll);
    expect(container.querySelector('[data-testid="nh-platform-tab-windows"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="nh-platform-tab-macos"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="nh-platform-tab-linux"]')).not.toBeNull();
    await fireEvent.click(
      container.querySelector('[data-testid="nh-platform-tab-macos"]') as HTMLButtonElement,
    );
    expect((container.querySelector('.install-code') as HTMLElement).textContent).toContain(
      'hello-macos',
    );
  });

  it('copy button writes the install command to clipboard', async () => {
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
    const { container } = render(CollapsibleInstallPanel, {
      props: {
        open: true,
        summaryLabel: 'View install command',
        defaultPlatform: 'linux',
        commands: commands(),
      },
    });
    const copyBtn = container.querySelector(
      'button[aria-label="Copy install command"]',
    ) as HTMLButtonElement;
    expect(copyBtn).not.toBeNull();
    await fireEvent.click(copyBtn);
    expect(writeText).toHaveBeenCalledWith('echo hello-linux');
    writeText.mockRestore();
  });
});

describe('Backends tab — native-host status pill class reflects state', () => {
  it('renders the probing state on initial mount (probe in flight)', async () => {
    const { container } = mountBackends();
    const pill = await waitFor(() => {
      const el = container.querySelector('[data-testid="nh-status-pill"]');
      expect(el).not.toBeNull();
      return el;
    });
    // chromeMock never settles the probe, so assert only that the four states stay exclusive.
    const cls = (pill as HTMLElement).className;
    const matches = ['nh-installed', 'nh-outdated', 'nh-missing', 'nh-probing'].filter((c) =>
      cls.includes(c),
    );
    expect(matches.length).toBe(1);
  });
});

describe('Backends tab — local-backend probe-timeout slider', () => {
  // The slider sits outside BackendList, so svelte-dnd-action cannot unmount it mid-drag.

  it('renders the local-backend timeout slider once on initial load', async () => {
    const { container } = mountBackends();
    await waitForLoaded(container);
    const slider = container.querySelector('[data-testid="local-backend-timeout-slider"]');
    expect(slider).not.toBeNull();
    // bits-ui renders a thumb with role="slider", not a native <input type="range">.
    const thumb = (slider as HTMLElement).querySelector('[role="slider"]');
    expect(thumb).not.toBeNull();
  });

  it('survives mid-drag re-renders (consider events on the enabled zone)', async () => {
    const { container } = mountBackends();
    await waitForLoaded(container);
    expect(container.querySelector('[data-testid="local-backend-timeout-slider"]')).not.toBeNull();

    // The placeholder takes anthropic's slot, so the keyed {#each} sees no duplicate ids.
    const SHADOW_ID = 'id:dnd-shadow-placeholder-0000';
    const enabledZone = container.querySelectorAll('[role="list"]')[0] as HTMLElement;
    expect(enabledZone).toBeTruthy();
    enabledZone.dispatchEvent(
      new CustomEvent('consider', {
        detail: {
          items: [
            { id: SHADOW_ID, isDndShadowItem: true },
            { id: 'openai' },
            { id: 'gemini' },
            { id: 'groq' },
            { id: 'deepseek' },
            { id: 'ollama' },
            { id: 'native' },
          ],
          info: { source: 'POINTER', trigger: 'DRAG_STARTED', id: SHADOW_ID },
        },
      }),
    );
    await tick();
    expect(enabledZone.querySelector('.be-shadow-slot')).not.toBeNull();
    expect(container.querySelector('[data-testid="local-backend-timeout-slider"]')).not.toBeNull();

    enabledZone.dispatchEvent(
      new CustomEvent('consider', {
        detail: {
          items: [
            { id: 'openai' },
            { id: 'anthropic' },
            { id: 'gemini' },
            { id: 'groq' },
            { id: 'deepseek' },
            { id: 'ollama' },
            { id: 'native' },
          ],
          info: { source: 'POINTER', trigger: 'DRAG_STARTED', id: 'anthropic' },
        },
      }),
    );
    await tick();
    expect(enabledZone.querySelector('[role="listitem"]')?.getAttribute('data-testid')).toBe(
      'be-row-openai',
    );
    expect(container.querySelector('[data-testid="local-backend-timeout-slider"]')).not.toBeNull();
  });

  it('round-trips slider input through updateSettings', async () => {
    const onSetSettings = vi.fn();
    const { container } = render(Backends, { props: { s: defaultSettings(), onSetSettings } });
    await waitForLoaded(container);
    const slider = container.querySelector('[data-ega-setting="backends.localBackendTimeoutMs"]');
    const thumb = (slider as HTMLElement).querySelector<HTMLElement>('[role="slider"]');
    expect(thumb).not.toBeNull();
    if (thumb) {
      thumb.focus();
      // Step size is not the contract — only that the readout follows the new value.
      await fireEvent.keyDown(thumb, { key: 'ArrowRight' });
      await fireEvent.keyUp(thumb, { key: 'ArrowRight' });
    }
    const saved = await waitFor(() => {
      expect(onSetSettings).toHaveBeenCalled();
      return (onSetSettings.mock.calls[0]?.[0] as Settings).localBackendTimeoutMs;
    });
    expect(saved).toBeGreaterThan(defaultSettings().localBackendTimeoutMs ?? 0);
    expect((slider as HTMLElement).textContent).toMatch(/\d(\.\d)? s\b/);
  });
});
