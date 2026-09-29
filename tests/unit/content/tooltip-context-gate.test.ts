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
