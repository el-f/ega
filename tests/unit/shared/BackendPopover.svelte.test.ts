// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import BackendPopover from '@/shared/components/BackendPopover.svelte';
import type { ProbeResult } from '@/shared/translate-ui';
import { asBackendIdUnsafe } from '@/shared/brands';
import { readFileSync } from 'node:fs';
import type { BackendId } from '@/shared/types';

const bid = (s: string) => asBackendIdUnsafe(s);

function makeAnchor(): HTMLElement {
  const a = document.createElement('span');
  a.setAttribute('data-anchor', '');
  document.body.appendChild(a);
  return a;
}

function makeProbe(
  available: Partial<ProbeResult['available']> = {},
  active: ProbeResult['active'] = bid('anthropic'),
): ProbeResult {
  return {
    available: {
      anthropic: true,
      openai: true,
      gemini: true,
      groq: false,
      deepseek: false,
      ollama: false,
      native: false,
      ...available,
    },
    active,
  };
}

const DEFAULT_PROPS = {
  open: true,
  backendOrder: ['anthropic', 'openai', 'gemini', 'groq', 'deepseek', 'ollama', 'native'].map(
    bid,
  ) as readonly BackendId[],
  disabledBackends: [] as readonly BackendId[],
  onManage: () => {},
  onClose: () => {},
};

async function waitForRows(): Promise<HTMLElement[]> {
  await tick();
  await waitFor(() => {
    const rows = document.body.querySelectorAll<HTMLElement>('.chain-row');
    if (rows.length === 0) throw new Error('chain rows not rendered yet');
    return rows;
  });
  return Array.from(document.body.querySelectorAll<HTMLElement>('.chain-row'));
}

const statusOf = (rows: HTMLElement[], re: RegExp): string =>
  rows.find((r) => re.test(String(r.textContent)))?.querySelector('.chain-status')?.textContent ??
  '';

describe('BackendPopover — the chain, in order, each with a plain status', () => {
  it('lists every backend that is on, in order; the first reachable one is In use', async () => {
    render(BackendPopover, {
      props: { ...DEFAULT_PROPS, anchor: makeAnchor(), probe: makeProbe({ anthropic: false }) },
    });
    const rows = await waitForRows();
    expect(rows).toHaveLength(7);
    expect(rows[0]?.textContent).toContain('1.');
    expect(rows[0]?.textContent).toContain('Anthropic');
    expect(statusOf(rows, /OpenAI/)).toBe('In use');
    expect(statusOf(rows, /Gemini/)).toBe('Ready');
    expect(statusOf(rows, /Anthropic/)).toBe("Can't connect");
    expect(document.body.textContent).toContain('Ega tries them in this order.');
  });

  it('says Checking… on every row before the probe answers', async () => {
    render(BackendPopover, {
      props: {
        ...DEFAULT_PROPS,
        anchor: makeAnchor(),
        probe: null,
        backendOrder: [bid('anthropic')] as readonly BackendId[],
      },
    });
    expect(statusOf(await waitForRows(), /Anthropic/)).toBe('Checking…');
  });

  it('leaves turned-off backends out, with no count line', async () => {
    render(BackendPopover, {
      props: {
        ...DEFAULT_PROPS,
        anchor: makeAnchor(),
        probe: makeProbe(),
        disabledBackends: [bid('groq'), bid('deepseek')] as readonly BackendId[],
      },
    });
    const rows = await waitForRows();
    expect(rows.find((r) => /Groq|DeepSeek/i.test(String(r.textContent)))).toBeUndefined();
    expect(document.body.textContent).not.toMatch(/turned off/);
  });

  it('a missing key reads Needs a key and offers Add key, which opens the backend settings', async () => {
    const onManage = vi.fn();
    render(BackendPopover, {
      props: {
        ...DEFAULT_PROPS,
        anchor: makeAnchor(),
        onManage,
        probe: makeProbe({ anthropic: false }),
        missingKeyIds: [bid('anthropic')] as readonly BackendId[],
      },
    });
    const rows = await waitForRows();
    expect(statusOf(rows, /Anthropic/)).toBe('Needs a key');
    const fix = rows.find((r) => /Anthropic/.test(String(r.textContent)))?.querySelector('button');
    expect(fix?.textContent).toBe('Add key');
    expect(fix?.getAttribute('aria-label')).toBe('Add key: Anthropic');
    if (!fix) throw new Error('Add key missing');
    await fireEvent.click(fix);
    expect(onManage).toHaveBeenCalledTimes(1);
  });

  it('an unreachable key-less backend reads Not running and offers How to start', async () => {
    render(BackendPopover, {
      props: { ...DEFAULT_PROPS, anchor: makeAnchor(), probe: makeProbe({ native: false }) },
    });
    const rows = await waitForRows();
    expect(statusOf(rows, /Claude Code or Codex/)).toBe('Not running');
    expect(
      rows.find((r) => /Claude Code or Codex/.test(String(r.textContent)))?.querySelector('button')
        ?.textContent,
    ).toBe('How to start');
  });

  it('labels every registered backend from the registry, never a raw id', async () => {
    render(BackendPopover, {
      props: {
        ...DEFAULT_PROPS,
        anchor: makeAnchor(),
        probe: makeProbe(),
        backendOrder: ['openrouter', 'mistral', 'xai', 'fireworks', 'together'].map(
          bid,
        ) as readonly BackendId[],
      },
    });
    const labels = (await waitForRows()).map((r) =>
      String(r.querySelector('.chain-label')?.textContent ?? '').trim(),
    );
    expect(labels).toEqual(['OpenRouter', 'Mistral', 'xAI', 'Fireworks', 'Together']);
  });

  it('is titled Backends, has no scrim, and does not render without an anchor', async () => {
    render(BackendPopover, {
      props: { ...DEFAULT_PROPS, anchor: makeAnchor(), probe: makeProbe() },
    });
    await waitForRows();
    expect(document.body.querySelector('.ega-popover-title')?.textContent).toBe('Backends');
    expect(document.body.querySelector('.ega-popover-scrim')).toBeNull();
    document.body.innerHTML = '';
    render(BackendPopover, { props: { ...DEFAULT_PROPS, anchor: null, probe: makeProbe() } });
    expect(document.body.querySelectorAll('.chain-row').length).toBe(0);
  });

  it('Manage backends fires onManage and closes', async () => {
    const onManage = vi.fn();
    const onClose = vi.fn();
    render(BackendPopover, {
      props: { ...DEFAULT_PROPS, anchor: makeAnchor(), probe: makeProbe(), onManage, onClose },
    });
    await waitForRows();
    const btn = document.body.querySelector<HTMLButtonElement>('[data-ega-manage-chain]');
    if (!btn) throw new Error('manage button missing');
    await fireEvent.click(btn);
    expect(onManage).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

// jsdom lays nothing out, so the size and the inset are pinned in the source; the e2e design checks measure them.
describe('BackendPopover — targets and text edge', () => {
  const src = readFileSync('src/shared/components/BackendPopover.svelte', 'utf8');
  const rule = (sel: string): string =>
    new RegExp(`${sel}\\s*\\{([^}]*)\\}`).exec(src)?.[1] ?? `missing ${sel}`;

  it('makes Add key, How to start and Manage backends 28px targets (spec §9.2)', () => {
    expect(rule('\\.setup-btn')).toMatch(/min-block-size:\s*28px/);
  });

  it('adds no inline padding, so the body text lines up with the popover title', () => {
    expect(rule('\\.chain-help')).not.toMatch(/padding/);
    expect(rule('\\.chain-row')).not.toMatch(/padding:\s/);
  });
});
