// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/svelte';
import Tooltip from '@/content/Tooltip.svelte';
import type { TipState } from '@/content/tipState.svelte';
import { setSettings } from '@/content/settings-cache';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';

function setup(extra: Partial<TipState> = {}) {
  const callbacks = {
    onclose: vi.fn(),
    oncancel: vi.fn(),
    onretry: vi.fn(),
    oncopy: vi.fn(),
    onexplain: vi.fn(),
    onregenerate: vi.fn(),
    onrefine: vi.fn(),
    ontargetchange: vi.fn(),
    ontaskchange: vi.fn(),
    onswap: vi.fn(),
    onescalate: vi.fn(),
  };
  const tip: TipState = {
    srcText: 'bonjour',
    body: 'Hello',
    loading: false,
    settled: true,
    confidencePill: true,
    confidence: 0.4,
    detectedLang: 'fr',
    left: 10,
    top: 10,
    task: 'translate',
    contextSent: null,
    ...extra,
  };
  return {
    ...render(Tooltip, {
      props: {
        tip,
        direction: { source: 'fr', target: 'en' },
        clickOutsideDismiss: true,
        ...callbacks,
      },
    }),
    ...callbacks,
  };
}

beforeEach(() => setSettings(DEFAULT_SETTINGS));

describe('tooltip reply redesign', () => {
  it('offers one row with at most five actions and always has Close', () => {
    const { container, getByRole } = setup();
    const row = container.querySelector('[data-ega-tooltip-actions]');
    expect(row).not.toBeNull();
    if (!row) throw new Error('No action row');
    expect([...row.querySelectorAll('button')].map((b) => b.getAttribute('aria-label'))).toEqual([
      'Copy translation',
      'Regenerate',
      'Refine',
      'Open in side panel',
      'More',
    ]);
    expect(getByRole('button', { name: 'Close' })).toBeTruthy();
  });

  it('uses the shared meta line above the action row, including low-confidence wording', () => {
    const { container } = setup();
    const meta = container.querySelector('[data-ega-reply-meta]');
    const actions = container.querySelector('[data-ega-tooltip-actions]');
    expect(meta?.textContent).toContain('French → English');
    expect(meta?.textContent).toContain('Low confidence (40%)');
    if (!meta || !actions) throw new Error('No meta or actions');
    expect(meta.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(container.querySelector('.pill')).toBeNull();
  });

  it('replaces the answer via Regenerate and hands off a finished reply from the same row', async () => {
    const { getByRole, onregenerate, onescalate } = setup();
    await fireEvent.click(getByRole('button', { name: 'Regenerate' }));
    expect(onregenerate).toHaveBeenCalledTimes(1);
    await fireEvent.click(getByRole('button', { name: 'Open in side panel' }));
    expect(onescalate).toHaveBeenCalledWith('pin');
  });

  it('opens About from a More checkbox without a second close control', async () => {
    const { getByRole, container } = setup();
    await fireEvent.keyDown(getByRole('button', { name: 'More' }), {
      key: 'ArrowDown',
    });
    const about = await waitFor(() => getByRole('menuitemcheckbox', { name: 'About this reply' }));
    await fireEvent.click(about);
    expect(container.querySelector('.reply-details')).not.toBeNull();
    expect(container.querySelectorAll('button[aria-label="Close"]')).toHaveLength(1);
  });

  it('shares the task presets and can describe a change from Refine', async () => {
    const { getByRole, onrefine } = setup();
    await fireEvent.keyDown(getByRole('button', { name: 'Refine' }), {
      key: 'ArrowDown',
    });
    await fireEvent.click(await waitFor(() => getByRole('menuitem', { name: 'Shorter' })));
    expect(onrefine).toHaveBeenCalledWith('Make outputs shorter.');
  });

  it('focuses the change editor, rejects blank changes, and applies trimmed instructions', async () => {
    const { getByRole, queryByRole, onrefine } = setup();
    await fireEvent.keyDown(getByRole('button', { name: 'Refine' }), { key: 'ArrowDown' });
    await fireEvent.click(
      await waitFor(() => getByRole('menuitem', { name: 'Describe a change…' })),
    );
    const input = getByRole('textbox', { name: 'Describe a change' });
    await waitFor(() => expect(document.activeElement).toBe(input));
    expect((getByRole('button', { name: 'Apply' }) as HTMLButtonElement).disabled).toBe(true);
    await fireEvent.input(input, { target: { value: '  Keep the greeting only.  ' } });
    await fireEvent.click(getByRole('button', { name: 'Apply' }));
    expect(onrefine).toHaveBeenCalledWith('Keep the greeting only.');
    expect(queryByRole('group', { name: 'Describe a change' })).toBeNull();
    expect(document.activeElement).toBe(getByRole('button', { name: 'Refine' }));
  });

  it('focuses the language selector and applies the chosen language id', async () => {
    const { getByRole, getByLabelText, ontargetchange } = setup();
    await fireEvent.keyDown(getByRole('button', { name: 'Refine' }), { key: 'ArrowDown' });
    await fireEvent.click(
      await waitFor(() => getByRole('menuitem', { name: 'Translate into another language…' })),
    );
    const input = getByLabelText('Translate into') as HTMLSelectElement;
    await waitFor(() => expect(document.activeElement).toBe(input));
    const spanish = [...input.options].find((option) => option.textContent === 'Spanish');
    if (!spanish) throw new Error('Spanish option missing');
    await fireEvent.change(input, { target: { value: spanish.value } });
    await fireEvent.click(getByRole('button', { name: 'Apply' }));
    expect(ontargetchange).toHaveBeenCalledWith('es');
  });

  it('Escape cancels the editor without dismissing or re-running the reply', async () => {
    const { getByRole, queryByRole, onclose, onrefine } = setup();
    await fireEvent.keyDown(getByRole('button', { name: 'Refine' }), { key: 'ArrowDown' });
    await fireEvent.click(
      await waitFor(() => getByRole('menuitem', { name: 'Describe a change…' })),
    );
    await fireEvent.keyDown(getByRole('textbox', { name: 'Describe a change' }), { key: 'Escape' });
    expect(queryByRole('group', { name: 'Describe a change' })).toBeNull();
    expect(onclose).not.toHaveBeenCalled();
    expect(onrefine).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(getByRole('button', { name: 'Refine' }));
  });

  it('lets a stopped reply run another task from More', async () => {
    const { getByRole, onexplain } = setup({ loading: false, settled: false, stopped: true });
    await fireEvent.keyDown(getByRole('button', { name: 'More' }), { key: 'ArrowDown' });
    const explain = await waitFor(() => getByRole('menuitem', { name: /^Explain instead/ }));
    expect(explain.getAttribute('aria-disabled')).not.toBe('true');
    await fireEvent.click(explain);
    expect(onexplain).toHaveBeenCalledTimes(1);
  });
});
