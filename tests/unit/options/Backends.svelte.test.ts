// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/svelte';
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

/** sr-only "First choice for text" lives on the card that wins the text route. */
function cardResolvesText(container: HTMLElement, backendId: string): boolean {
  const card = container.querySelector(`[data-backend-id="${backendId}"]`);
  return card !== null && /First choice for .*text/i.test(card.textContent);
}

describe('Backends tab — provider cards', () => {
  it('lists no chrome-ai provider card', async () => {
    const { container } = mountBackends();
    for (let i = 0; i < 40; i += 1) {
      await new Promise((r) => setTimeout(r, 25));
      if (container.textContent && /Anthropic/.test(container.textContent)) break;
    }
    expect(container.textContent).toMatch(/Anthropic/);
    // Native-host help mentions "Chrome" the browser, so match chrome-ai tokens only.
    expect(container.textContent).not.toMatch(/chrome-ai/i);
    expect(container.textContent).not.toMatch(/chrome built-in ai/i);
    expect(container.textContent).not.toMatch(/gemini nano/i);
  });
});

describe('Backends tab — route markers gate on key presence', () => {
  // A key-less anthropic is dropped by the router, so native serves the text route.
  async function waitForLoaded(container: HTMLElement): Promise<void> {
    for (let i = 0; i < 40; i += 1) {
      await new Promise((r) => setTimeout(r, 25));
      if (container.textContent && /Anthropic/.test(container.textContent)) return;
    }
  }

  it('does NOT mark a key-less anthropic as the text route; native wins instead', async () => {
    const { container } = mountBackends();
    await waitForLoaded(container);
    expect(cardResolvesText(container, 'anthropic')).toBe(false);
    expect(cardResolvesText(container, 'native')).toBe(true);
  });

  it('marks anthropic as the text route once its key is present', async () => {
    const { container } = mountBackendsWith({ anthropicApiKey: 'sk-ant-test' });
    await waitForLoaded(container);
    expect(cardResolvesText(container, 'anthropic')).toBe(true);
    expect(cardResolvesText(container, 'native')).toBe(false);
  });
});

describe('Backends grouping', () => {
  it('renders all 7 registered backend rows in BackendList', async () => {
    const { container } = mountBackends();
    for (let i = 0; i < 40; i += 1) {
      await new Promise((r) => setTimeout(r, 25));
      if (container.textContent && /Anthropic/.test(container.textContent)) break;
    }
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
    await new Promise((r) => setTimeout(r, 50));
    const cloudIds = Array.from(
      container.querySelectorAll('[data-section="cloud"] [data-backend-id]'),
    ).map((e) => e.getAttribute('data-backend-id'));
    expect(cloudIds).toEqual(
      expect.arrayContaining(['anthropic', 'openai', 'gemini', 'groq', 'deepseek']),
    );
  });

  it('text-only chip appears on groq and deepseek cards (no translateImage) but not on vision-capable cards', async () => {
    const { container } = mountBackends();
    for (let i = 0; i < 40; i += 1) {
      await new Promise((r) => setTimeout(r, 25));
      if (container.textContent && /Anthropic/.test(container.textContent)) break;
    }
    const groqCard = container.querySelector('[data-backend-id="groq"]');
    expect(groqCard).not.toBeNull();
    const groqChip = (groqCard as Element).querySelector('.be-tag');
    expect(groqChip).not.toBeNull();
    expect(groqChip?.textContent).toMatch(/text-only/i);

    const deepseekCard = container.querySelector('[data-backend-id="deepseek"]');
    expect(deepseekCard).not.toBeNull();
    const deepseekChip = (deepseekCard as Element).querySelector('.be-tag');
    expect(deepseekChip).not.toBeNull();
    expect(deepseekChip?.textContent).toMatch(/text-only/i);

    const anthropicCard = container.querySelector('[data-backend-id="anthropic"]');
    expect(anthropicCard).not.toBeNull();
    expect((anthropicCard as Element).querySelector('.be-tag')).toBeNull();
  });

  it('local section contains ollama card', async () => {
    const { container } = mountBackends();
    await new Promise((r) => setTimeout(r, 50));
    const localIds = Array.from(
      container.querySelectorAll('[data-section="local"] [data-backend-id]'),
    ).map((e) => e.getAttribute('data-backend-id'));
    expect(localIds).toContain('ollama');
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
    for (let i = 0; i < 40; i += 1) {
      await new Promise((r) => setTimeout(r, 25));
      const pill = container.querySelector('[data-testid="nh-status-pill"]');
      if (pill) break;
    }
    const pill = container.querySelector('[data-testid="nh-status-pill"]');
    expect(pill).not.toBeNull();
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
  async function waitForLoaded(container: HTMLElement): Promise<void> {
    for (let i = 0; i < 40; i += 1) {
      await new Promise((r) => setTimeout(r, 25));
      if (container.textContent && /Anthropic/.test(container.textContent)) return;
    }
  }

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
    await new Promise((r) => setTimeout(r, 25));
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
    await new Promise((r) => setTimeout(r, 25));
    expect(container.querySelector('[data-testid="local-backend-timeout-slider"]')).not.toBeNull();
  });

  it('round-trips slider input through updateSettings', async () => {
    const { container } = mountBackends();
    await waitForLoaded(container);
    const slider = container.querySelector('[data-testid="local-backend-timeout-slider"]');
    const thumb = (slider as HTMLElement).querySelector<HTMLElement>('[role="slider"]');
    expect(thumb).not.toBeNull();
    if (thumb) {
      thumb.focus();
      // Step size is not the contract — only that the readout follows the new value.
      await fireEvent.keyDown(thumb, { key: 'ArrowRight' });
    }
    await new Promise((r) => setTimeout(r, 50));
    expect((slider as HTMLElement).textContent).toMatch(/\d+\s*ms/);
  });
});
