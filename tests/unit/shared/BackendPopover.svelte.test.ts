// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import BackendPopover from '@/shared/components/BackendPopover.svelte';
import type { ProbeResult } from '@/shared/translate-ui';
import { asBackendIdUnsafe } from '@/shared/brands';
import type { BackendId, Settings } from '@/shared/types';

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
  task: 'translate' as const,
  taskBackends: {} as Settings['taskBackends'],
  backendOrder: ['anthropic', 'openai', 'gemini', 'groq', 'deepseek', 'ollama', 'native'].map(
    bid,
  ) as readonly BackendId[],
  taskBackendChains: {} as Settings['advanced']['taskBackendChains'],
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

describe('BackendPopover — chain visualization', () => {
  it('renders one row per chain entry in resolved order with first reachable getting active badge', async () => {
    const anchor = makeAnchor();
    render(BackendPopover, {
      props: {
        ...DEFAULT_PROPS,
        anchor,
        probe: makeProbe({ anthropic: false, openai: true }),
      },
    });
    const rows = await waitForRows();
    // backendOrder has 7 entries, no disabled, chain visualizes all 7
    expect(rows).toHaveLength(7);
    const labels = rows.map((r) => String(r.textContent).replace(/\s+/g, ' ').trim());
    expect(labels[0]).toContain('1.');
    expect(labels[0]).toContain('Anthropic');
    expect(labels[1]).toContain('OpenAI');
    // openai is first reachable → active badge
    const openaiRow = rows.find((r) => /OpenAI/.test(String(r.textContent)));
    expect(openaiRow?.querySelector('.badge-active')).toBeTruthy();
    // anthropic unreachable → error badge
    const anthropicRow = rows.find((r) => /Anthropic/.test(String(r.textContent)));
    expect(anthropicRow?.querySelector('.badge-error')).toBeTruthy();
  });

  it('each chain row carries an aria-label with the resolved state', async () => {
    const anchor = makeAnchor();
    render(BackendPopover, {
      props: {
        ...DEFAULT_PROPS,
        anchor,
        probe: makeProbe({ anthropic: false, openai: true }),
        backendOrder: ['anthropic', 'openai', 'groq'].map(bid) as readonly BackendId[],
        disabledBackends: [bid('groq')] as readonly BackendId[],
      },
    });
    const rows = await waitForRows();
    const labelOf = (re: RegExp) =>
      rows.find((r) => re.test(String(r.getAttribute('aria-label'))))?.getAttribute('aria-label') ??
      '';
    // anthropic unreachable, openai first reachable → active, groq disabled so it is not a row
    expect(labelOf(/Anthropic/)).toBe('Anthropic, unreachable');
    expect(labelOf(/OpenAI/)).toBe('OpenAI, active');
    expect(labelOf(/Groq/)).toBe('');
  });

  it('chain rows announce "checking" before the probe resolves', async () => {
    const anchor = makeAnchor();
    render(BackendPopover, {
      props: {
        ...DEFAULT_PROPS,
        anchor,
        probe: null,
        backendOrder: ['anthropic'].map(bid) as readonly BackendId[],
      },
    });
    const rows = await waitForRows();
    expect(rows[0]?.getAttribute('aria-label')).toBe('Anthropic, checking');
  });

  it('counts disabled backends under the chain instead of listing each one', async () => {
    const anchor = makeAnchor();
    render(BackendPopover, {
      props: {
        ...DEFAULT_PROPS,
        anchor,
        probe: makeProbe(),
        disabledBackends: [bid('groq'), bid('deepseek')] as readonly BackendId[],
      },
    });
    const rows = await waitForRows();
    expect(rows.find((r) => /Groq/.test(String(r.textContent)))).toBeUndefined();
    expect(rows.find((r) => /DeepSeek/i.test(String(r.textContent)))).toBeUndefined();
    const summary = document.body.querySelector('.chain-off');
    expect((summary?.textContent ?? '').replace(/\s+/g, ' ')).toMatch(
      /2 backends are turned off\./,
    );
  });

  it('leaves out the disabled count when every backend is on', async () => {
    const anchor = makeAnchor();
    render(BackendPopover, {
      props: { ...DEFAULT_PROPS, anchor, probe: makeProbe() },
    });
    await waitForRows();
    expect(document.body.querySelector('.chain-off')).toBeNull();
  });

  it('falls back to backendOrder when no per-task chain present', async () => {
    const anchor = makeAnchor();
    render(BackendPopover, {
      props: {
        ...DEFAULT_PROPS,
        anchor,
        probe: makeProbe(),
        backendOrder: ['gemini', 'anthropic'].map(bid) as readonly BackendId[],
      },
    });
    const rows = await waitForRows();
    expect(rows).toHaveLength(2);
    expect(rows[0]?.textContent).toMatch(/Gemini/);
    expect(rows[1]?.textContent).toMatch(/Anthropic/);
  });

  it('honors per-task chain over backendOrder when present', async () => {
    const anchor = makeAnchor();
    render(BackendPopover, {
      props: {
        ...DEFAULT_PROPS,
        anchor,
        probe: makeProbe(),
        backendOrder: ['anthropic', 'openai'].map(bid) as readonly BackendId[],
        taskBackendChains: {
          translate: ['gemini', 'openai'].map(bid) as BackendId[],
        },
      },
    });
    const rows = await waitForRows();
    expect(rows[0]?.textContent).toMatch(/Gemini/);
    expect(rows[1]?.textContent).toMatch(/OpenAI/);
  });

  it('shows "No backend ready" banner with a visible setup button when probe.active is null', async () => {
    const anchor = makeAnchor();
    const onManage = vi.fn();
    const onClose = vi.fn();
    render(BackendPopover, {
      props: {
        ...DEFAULT_PROPS,
        anchor,
        probe: makeProbe({}, null),
        onManage,
        onClose,
      },
    });
    await waitForRows();
    expect(document.body.textContent).toContain('No backend ready');
    const setup = Array.from(document.body.querySelectorAll('button')).find((b) =>
      /Set up backends/.test(String(b.textContent)),
    );
    expect(setup).toBeTruthy();
    if (!setup) throw new Error('setup button missing');
    await fireEvent.click(setup);
    expect(onManage).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('says "Checking backends…" — not "No backend ready" — while the probe is in flight', async () => {
    const anchor = makeAnchor();
    render(BackendPopover, {
      props: { ...DEFAULT_PROPS, anchor, probe: null },
    });
    await waitForRows();
    expect(document.body.textContent).toContain('Checking backends…');
    expect(document.body.textContent).not.toContain('No backend ready');
  });

  it('heading names the fallback order, not "chain"', async () => {
    const anchor = makeAnchor();
    render(BackendPopover, {
      props: { ...DEFAULT_PROPS, anchor, probe: makeProbe() },
    });
    await waitForRows();
    // The dialog's own title carries it now, so the popover has an accessible name and one heading.
    const title = document.body.querySelector('.ega-popover-title');
    expect(title?.textContent).toBe('Fallback order');
    expect(document.body.querySelector('.section-heading')).toBeNull();
  });

  it('does not render when anchor is null', () => {
    render(BackendPopover, {
      props: { ...DEFAULT_PROPS, anchor: null, probe: makeProbe() },
    });
    expect(document.body.querySelectorAll('.chain-row').length).toBe(0);
  });
});

describe('BackendPopover — badge split (unconfigured vs failing)', () => {
  it('a keyed backend missing its key gets a neutral "no key" badge, not error', async () => {
    const anchor = makeAnchor();
    render(BackendPopover, {
      props: {
        ...DEFAULT_PROPS,
        anchor,
        probe: makeProbe({ anthropic: false, openai: true }),
        missingKeyIds: [bid('anthropic')] as readonly BackendId[],
      },
    });
    const rows = await waitForRows();
    const anthropicRow = rows.find((r) => /Anthropic/.test(String(r.textContent)));
    expect(anthropicRow?.querySelector('.badge-error')).toBeNull();
    expect(anthropicRow?.querySelector('.badge-muted')?.textContent).toBe('no key');
    expect(anthropicRow?.getAttribute('aria-label')).toBe('Anthropic, no API key');
  });

  it('an unreachable key-less backend reads "not running", not error', async () => {
    const anchor = makeAnchor();
    render(BackendPopover, {
      props: {
        ...DEFAULT_PROPS,
        anchor,
        probe: makeProbe({ native: false }),
      },
    });
    const rows = await waitForRows();
    const nativeRow = rows.find((r) =>
      /Native host \(Claude Code \/ Codex\)/.test(String(r.textContent)),
    );
    expect(nativeRow?.querySelector('.badge-error')).toBeNull();
    expect(nativeRow?.querySelector('.badge-muted')?.textContent).toBe('not running');
    expect(nativeRow?.getAttribute('aria-label')).toBe(
      'Native host (Claude Code / Codex), not running',
    );
  });

  it('labels every registered backend from the registry, never a raw lowercase id', async () => {
    const anchor = makeAnchor();
    render(BackendPopover, {
      props: {
        ...DEFAULT_PROPS,
        anchor,
        probe: makeProbe(),
        backendOrder: ['openrouter', 'mistral', 'xai', 'fireworks', 'together'].map(
          bid,
        ) as readonly BackendId[],
      },
    });
    const rows = await waitForRows();
    const labels = rows.map((r) =>
      String(r.querySelector('.chain-label')?.textContent ?? '').trim(),
    );
    expect(labels).toEqual(['OpenRouter', 'Mistral', 'xAI', 'Fireworks', 'Together']);
  });

  it('a keyed backend with a key that still fails the probe keeps the error badge', async () => {
    const anchor = makeAnchor();
    render(BackendPopover, {
      props: {
        ...DEFAULT_PROPS,
        anchor,
        probe: makeProbe({ anthropic: false, openai: true }),
        missingKeyIds: [] as readonly BackendId[],
      },
    });
    const rows = await waitForRows();
    const anthropicRow = rows.find((r) => /Anthropic/.test(String(r.textContent)));
    expect(anthropicRow?.querySelector('.badge-error')).toBeTruthy();
  });
});

describe('BackendPopover — manage footer', () => {
  it('Manage chain button fires onManage + onClose', async () => {
    const anchor = makeAnchor();
    const onManage = vi.fn();
    const onClose = vi.fn();
    render(BackendPopover, {
      props: { ...DEFAULT_PROPS, anchor, probe: makeProbe(), onManage, onClose },
    });
    await waitForRows();
    const btn = document.body.querySelector<HTMLButtonElement>('[data-ega-manage-chain]');
    if (!btn) throw new Error('manage button missing');
    await fireEvent.click(btn);
    expect(onManage).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
