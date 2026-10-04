// @vitest-environment jsdom
import type { ComponentProps } from 'svelte';
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import Tooltip from '@/content/Tooltip.svelte';

type TipState = ComponentProps<typeof Tooltip>['tip'];

function handlers() {
  return {
    onclose: vi.fn(),
    oncancel: vi.fn(),
    onretry: vi.fn(),
    oncopy: vi.fn(),
    onexplain: vi.fn(),
    onopenoptions: vi.fn(),
  };
}

function baseTip(): TipState {
  return {
    srcText: 'hello',
    body: 'translation',
    loading: false,
    confidencePill: true,
    left: 10,
    top: 10,
  };
}

function mount(tip: TipState) {
  return render(Tooltip, {
    props: { tip, clickOutsideDismiss: true, showSource: false, ...handlers() },
  });
}

const detailsBtn = (c: ParentNode) =>
  c.querySelector<HTMLButtonElement>('button[aria-label="Show details about this reply"]');

/** Opens the details panel and returns the Page info row's text. */
async function pageInfo(c: HTMLElement): Promise<string> {
  const btn = detailsBtn(c);
  if (!btn) throw new Error('no details button');
  await fireEvent.click(btn);
  return c.querySelector('[data-ega-context-preview]')?.textContent ?? '';
}

const contextSent = { pageUrl: 'https://x.test', pageTitle: 'Page X', beforeText: 'foo' };

describe('Tooltip — what the details panel says about page info', () => {
  it('an explain re-run follows the Explain switch, which is the one the router applies', async () => {
    const { updateTask } = await import('@/shared/tasks');
    const { ensureSettings, resetSettingsCacheForTest } = await import('@/content/settings-cache');
    await updateTask('explain', { pageContext: false });
    resetSettingsCacheForTest();
    await ensureSettings();
    const rerun = mount({ ...baseTip(), task: 'translate', contextTask: 'explain', contextSent });
    expect(await pageInfo(rerun.container)).toContain('Page info was off');
    rerun.unmount();
    const plain = mount({ ...baseTip(), task: 'translate', contextSent });
    expect(await pageInfo(plain.container)).toContain('Page X');
    plain.unmount();
    await updateTask('explain', { pageContext: true });
    resetSettingsCacheForTest();
  });

  it('says page info was off for a task that does not send it, and shows it for Translate', async () => {
    const { ensureSettings } = await import('@/content/settings-cache');
    await ensureSettings();
    const off = mount({ ...baseTip(), task: 'summarize', contextSent });
    expect(await pageInfo(off.container)).toContain('Page info was off');
    off.unmount();
    const on = mount({ ...baseTip(), task: 'translate', contextSent });
    expect(await pageInfo(on.container)).toContain('Page X');
  });

  it('says page info was off when none was sent (image, context off)', async () => {
    const { container } = mount({
      ...baseTip(),
      contextSent: null,
      imageUrl: 'data:image/png;base64,AAAA',
    });
    expect(await pageInfo(container)).toContain('Page info was off');
  });

  it('has no details button when the reply recorded nothing at all', () => {
    const { container } = mount(baseTip());
    expect(detailsBtn(container)).toBeNull();
  });
});
