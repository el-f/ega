// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import TooltipBody from '@/content/tooltip/TooltipBody.svelte';
import Tooltip from '@/content/Tooltip.svelte';

const live = (container: HTMLElement): HTMLElement | null =>
  container.querySelector<HTMLElement>('[data-ega-tooltip-live]');

describe('TooltipBody live region', () => {
  it('exists before the text arrives, so the first update is announced', () => {
    const { container } = render(TooltipBody, {
      props: { body: '', loading: true, task: 'translate' },
    });
    const region = live(container);
    expect(region).not.toBeNull();
    expect(region?.getAttribute('aria-live')).toBe('polite');
    expect(region?.textContent.trim()).toBe('');
  });

  it('stays silent while the text streams in, token by token', async () => {
    const { container, rerender } = render(TooltipBody, {
      props: { body: 'Hel', loading: false, task: 'translate', settled: false },
    });
    expect(live(container)?.textContent.trim()).toBe('');
    await rerender({ body: 'Hello wo', loading: false, task: 'translate', settled: false });
    expect(live(container)?.textContent.trim()).toBe('');
    await rerender({ body: 'Hello world', loading: false, task: 'translate', settled: false });
    expect(live(container)?.textContent.trim()).toBe('');
  });

  it('announces the text once, when the answer settles', async () => {
    const { container, rerender } = render(TooltipBody, {
      props: { body: 'Hello wo', loading: false, task: 'translate', settled: false },
    });
    await rerender({ body: 'Hello world', loading: false, task: 'translate', settled: true });
    expect(live(container)?.textContent.trim()).toBe('Hello world');
  });

  it('hides the visible copy from screen readers once the live region carries it', async () => {
    const { container, rerender } = render(TooltipBody, {
      props: { body: 'Hello wo', loading: false, task: 'translate', settled: false },
    });
    expect(container.querySelector('.body')?.getAttribute('aria-hidden')).not.toBe('true');
    await rerender({ body: 'Hello world', loading: false, task: 'translate', settled: true });
    expect(container.querySelector('.body')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('announces the error text', () => {
    const { container } = render(TooltipBody, {
      props: {
        body: '',
        loading: false,
        task: 'translate',
        error: { code: 'NETWORK', message: 'request timed out' },
      },
    });
    expect(live(container)?.textContent).toContain('request timed out');
  });

  it('keeps the partial text readable when an error follows it', () => {
    const { container } = render(TooltipBody, {
      props: {
        body: 'Hello wo',
        loading: false,
        task: 'translate',
        error: { code: 'NETWORK', message: 'request timed out' },
      },
    });
    expect(container.querySelector('.body')?.getAttribute('aria-hidden')).not.toBe('true');
  });
});

describe('TooltipBody text direction', () => {
  it('sets dir=auto on the result, so Hebrew and Arabic read right to left', () => {
    const { container } = render(TooltipBody, {
      props: { body: 'שלום עולם', loading: false, task: 'translate', settled: true },
    });
    expect(container.querySelector('.body')?.getAttribute('dir')).toBe('auto');
  });

  it('sets dir=auto on the error body', () => {
    const { container } = render(TooltipBody, {
      props: {
        body: '',
        loading: false,
        task: 'translate',
        error: { code: 'NETWORK', message: 'request timed out' },
      },
    });
    expect(container.querySelector('.body')?.getAttribute('dir')).toBe('auto');
  });

  it('sets dir=auto on the explanation', () => {
    const { container } = render(TooltipBody, {
      props: {
        body: 'Hello world',
        loading: false,
        task: 'explain',
        explain: 'ברכה אזורית',
        settled: true,
      },
    });
    expect(container.querySelector('.explain-body')?.getAttribute('dir')).toBe('auto');
  });

  it('sets dir=auto on the source echo, which is the right-to-left side of a reverse translation', () => {
    const { container } = render(Tooltip, {
      props: {
        tip: {
          srcText: 'שלום עולם',
          body: 'hello world',
          loading: false,
          confidencePill: false,
          left: 10,
          top: 10,
        },
        clickOutsideDismiss: true,
        showSource: true,
        onclose: vi.fn(),
        oncancel: vi.fn(),
        onretry: vi.fn(),
        oncopy: vi.fn(),
        onexplain: vi.fn(),
        onopenoptions: vi.fn(),
      },
    });
    expect(container.querySelector('.src')?.getAttribute('dir')).toBe('auto');
  });
});
