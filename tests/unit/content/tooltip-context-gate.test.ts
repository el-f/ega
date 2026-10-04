// @vitest-environment jsdom
import type { ComponentProps } from 'svelte';
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/svelte';
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

const ctxBtn = (c: ParentNode) => c.querySelector('button[data-tooltip="Context"]');
const ctxPreview = (c: ParentNode) => c.querySelector('[data-ega-context-preview]');

describe('Tooltip — context-icon gate', () => {
  it('an explain re-run follows the Explain switch, which is the one the router applies', async () => {
    const { updateTask } = await import('@/shared/tasks');
    const { ensureSettings, resetSettingsCacheForTest } = await import('@/content/settings-cache');
    await updateTask('explain', { pageContext: false });
    resetSettingsCacheForTest();
    await ensureSettings();
    const contextSent = { pageUrl: 'https://x.test', pageTitle: 'X', beforeText: 'foo' };
    const rerun = mount({ ...baseTip(), task: 'translate', contextTask: 'explain', contextSent });
    expect(ctxBtn(rerun.container)).toBeNull();
    rerun.unmount();
    const plain = mount({ ...baseTip(), task: 'translate', contextSent });
    expect(ctxBtn(plain.container)).not.toBeNull();
    plain.unmount();
    await updateTask('explain', { pageContext: true });
    resetSettingsCacheForTest();
  });

  it('hides the Context icon for a task whose page context is off, and keeps it for Translate', async () => {
    const { ensureSettings } = await import('@/content/settings-cache');
    await ensureSettings();
    const contextSent = { pageUrl: 'https://x.test', pageTitle: 'X', beforeText: 'foo' };
    const off = mount({ ...baseTip(), task: 'summarize', contextSent });
    expect(ctxBtn(off.container)).toBeNull();
    off.unmount();
    const on = mount({ ...baseTip(), task: 'translate', contextSent });
    expect(ctxBtn(on.container)).not.toBeNull();
  });

  it('hides the Context icon when contextSent is null (image / context-off)', () => {
    const { container } = mount({
      ...baseTip(),
      contextSent: null,
      imageUrl: 'data:image/png;base64,AAAA',
    });
    expect(ctxBtn(container)).toBeNull();
    expect(ctxPreview(container)).toBeNull();
  });

  it('hides the Context icon when contextSent is an empty object', () => {
    const { container } = mount({ ...baseTip(), contextSent: {} });
    expect(ctxBtn(container)).toBeNull();
    expect(ctxPreview(container)).toBeNull();
  });

  it('shows the Context icon when real page context was sent', () => {
    const { container } = mount({
      ...baseTip(),
      contextSent: { pageTitle: 'Example', pageUrl: 'https://example.test' },
    });
    expect(ctxBtn(container)).toBeTruthy();
    expect(ctxPreview(container)).toBeTruthy();
  });
});
