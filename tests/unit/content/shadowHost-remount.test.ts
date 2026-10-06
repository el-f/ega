// @vitest-environment jsdom
/** One case per onShadowHostRemount registrant: a missing one leaves its component in the detached root, holding listeners. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mountShadowHost, getContainer, getShadowRoot } from '@/content/shadowHost';
import { openBubbleMenu } from '@/content/bubble-menu';
import { showBatchProgress, isBatchProgressActive } from '@/content/batch-progress';
import { showBubble, hideBubble } from '@/content/bubble';
import { showToast, dismissToast } from '@/content/toast';
import { openTooltip, closeTooltip } from '@/content/tipState.svelte';
import { enterPickerMode, teardownPicker } from '@/content/picker-overlay';
import {
  enterMultiSelect,
  exitMultiSelect,
  isMultiSelectActive,
} from '@/content/page-translate-v2/multi-select';

function rect(): DOMRect {
  return {
    x: 10,
    y: 10,
    left: 10,
    top: 10,
    right: 110,
    bottom: 40,
    width: 100,
    height: 30,
    toJSON: () => ({}),
  } as DOMRect;
}

/** Removes the host and rebuilds it; returns the DETACHED container, the only one that shows a missing disposer. */
function remountHost(): HTMLElement {
  const orphaned = getContainer();
  document.getElementById('ega-shadow-host')?.remove();
  mountShadowHost();
  return orphaned;
}

function liveCount(selector: string): number {
  return getShadowRoot().querySelectorAll(selector).length;
}

describe('every shadow-host surface disposes on a remount', () => {
  beforeEach(() => {
    // jsdom has no elementsFromPoint; the bubble's overlap check calls it on mount.
    (document as unknown as { elementsFromPoint: () => Element[] }).elementsFromPoint = () => [];
    mountShadowHost();
  });

  afterEach(() => {
    closeTooltip();
    hideBubble();
    dismissToast();
    exitMultiSelect();
    teardownPicker();
    vi.useRealTimers();
  });

  it('bubble menu', () => {
    showBubble({ rect: rect(), queued: 0, onClick: () => {} });
    const chevron = getShadowRoot().querySelector<HTMLButtonElement>('.bubble-more');
    if (!chevron) throw new Error('no chevron');
    openBubbleMenu(chevron, { focusFirst: false, hideBubble });
    expect(liveCount('[data-ega-bubble-menu]')).toBe(1);

    const orphaned = remountHost();

    expect(orphaned.querySelectorAll('[data-ega-bubble-menu]')).toHaveLength(0);
  });

  it('batch progress pill', () => {
    showBatchProgress(3, () => {});
    expect(isBatchProgressActive()).toBe(true);

    const orphaned = remountHost();

    expect(isBatchProgressActive()).toBe(false);
    expect(orphaned.querySelectorAll('[data-ega-batch-progress-wrap]')).toHaveLength(0);
  });

  it('smart bubble', () => {
    showBubble({ rect: rect(), queued: 0, onClick: () => {} });
    expect(liveCount('[data-ega-bubble-wrap]')).toBe(1);

    const orphaned = remountHost();

    expect(orphaned.querySelectorAll('[data-ega-bubble-wrap]')).toHaveLength(0);
  });

  it('toast', () => {
    showToast('hi');
    expect(liveCount('[data-ega-toast-wrap]')).toBe(1);

    const orphaned = remountHost();

    expect(orphaned.querySelectorAll('[data-ega-toast-wrap]')).toHaveLength(0);
  });

  it('tooltip', () => {
    openTooltip({ requestId: 'r1', srcText: 'hola', rect: rect() });
    expect(liveCount('[data-ega-tooltip-wrap]')).toBe(1);

    const orphaned = remountHost();

    expect(orphaned.querySelectorAll('[data-ega-tooltip-wrap]')).toHaveLength(0);
  });

  it('picker overlay', async () => {
    await enterPickerMode(() => {});
    expect(liveCount('[data-ega-picker-wrap]')).toBe(1);

    const orphaned = remountHost();

    expect(orphaned.querySelectorAll('[data-ega-picker-wrap]')).toHaveLength(0);
  });

  it('multi-select toolbar', () => {
    enterMultiSelect({ initialMode: 'inplace', onFire: () => {} });
    expect(isMultiSelectActive()).toBe(true);
    expect(liveCount('[data-ega-ms-wrap]')).toBe(1);

    const orphaned = remountHost();

    expect(isMultiSelectActive()).toBe(false);
    expect(orphaned.querySelectorAll('[data-ega-ms-wrap]')).toHaveLength(0);
  });

  it('leaves the rebuilt container empty when several surfaces were up at once', () => {
    showToast('hi');
    showBubble({ rect: rect(), queued: 0, onClick: () => {} });
    showBatchProgress(2, () => {});
    expect(getContainer().children.length).toBeGreaterThan(2);

    const orphaned = remountHost();

    expect(orphaned.children.length).toBe(0);
  });
});
