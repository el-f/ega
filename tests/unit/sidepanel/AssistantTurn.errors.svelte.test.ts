// @vitest-environment jsdom
// Side panel spec §5.5 with the shared error catalog (cross-spec X1, X2, X7): short red title, a plain body,
// the fix first, "Try again" second, Details as a toggle.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import AssistantTurn from '@/sidepanel/conversation/AssistantTurn.svelte';
import { doneReply, metaText, replyProps } from './_reply';

const openOptionsTab = vi.hoisted(() => vi.fn());
vi.mock('@/shared/open-options-tab', () => ({ openOptionsTab }));

afterEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = '';
});

/** A failed reply records no meta: the router attaches it only to a done chunk. */
function failed(code: string, message: string, over: Record<string, unknown> = {}) {
  const t = doneReply({
    status: 'error',
    content: '',
    error: { code, message, backendId: 'anthropic' as never },
    ...over,
  });
  delete t.meta;
  for (const v of t.variants ?? []) delete v.meta;
  return t;
}

const buttons = (c: HTMLElement): string[] =>
  Array.from(c.querySelectorAll('.ega-error-actions .ega-btn')).map((b) => b.textContent.trim());

describe('an error reply', () => {
  it('a rejected key: title, a sentence naming the backend, Open settings then Try again, Details', async () => {
    const { container } = render(AssistantTurn, {
      props: replyProps(failed('AUTH', 'Anthropic rejected the key.\nHTTP 401: invalid x-api-key')),
    });
    const alert = container.querySelector('[role="alert"]');
    expect(alert?.querySelector('.ega-error-title')?.textContent.trim()).toBe('API key rejected');
    expect(alert?.querySelector('.ega-error-body')?.textContent).toBe(
      'Anthropic did not accept the saved API key.',
    );
    expect(buttons(container)).toEqual(['Open settings', 'Try again', 'Details ▸']);
    const [fix, again] = Array.from(container.querySelectorAll('.ega-error-actions .ega-btn'));
    expect(fix?.getAttribute('data-variant')).toBe('secondary');
    expect(again?.getAttribute('data-variant')).toBe('ghost');
    await fireEvent.click(fix as HTMLElement);
    expect(openOptionsTab).toHaveBeenCalledWith('backends');
    await fireEvent.click(container.querySelector('[data-ega-error-details]') as HTMLElement);
    expect(container.querySelector('.ega-error-detail')?.textContent).toContain('HTTP 401');
  });

  it('never says "Retry"; Try again sends the slot again', async () => {
    const props = replyProps(failed('NETWORK', 'fetch failed'));
    const { container } = render(AssistantTurn, { props });
    expect(container.textContent).not.toMatch(/\bRetry\b/);
    await fireEvent.click(container.querySelector('[data-ega-retry]') as HTMLElement);
    expect(props.onRetry).toHaveBeenCalledWith('a1');
  });

  it('a second failure offers the backends even when the code names no setting', async () => {
    const { container } = render(AssistantTurn, {
      props: replyProps(failed('NETWORK', 'fetch failed', { retries: 1 })),
    });
    expect(buttons(container)).toContain('Open settings');
    await fireEvent.click(
      container.querySelector('[data-ega-sidepanel-open-options]') as HTMLElement,
    );
    expect(openOptionsTab).toHaveBeenCalledWith('backends');
  });

  it('a rate limit counts down on the one button, marked unavailable', async () => {
    const turn = failed('RATE_LIMIT', 'HTTP 429', {
      error: { code: 'RATE_LIMIT', message: 'HTTP 429', retryUntil: Date.now() + 12_000 },
    });
    const props = replyProps(turn);
    const { container } = render(AssistantTurn, { props });
    const btn = container.querySelector('[data-ega-retry]') as HTMLElement;
    expect(btn.textContent.trim()).toMatch(/^Try again in 1[12] s$/);
    expect(btn.getAttribute('aria-disabled')).toBe('true');
    await fireEvent.click(btn);
    expect(props.onRetry).not.toHaveBeenCalled();
  });

  it('while another reply runs, Try again says why and does nothing', async () => {
    const props = replyProps(failed('NETWORK', 'x'), { inflight: true });
    const { container } = render(AssistantTurn, { props });
    const btn = container.querySelector('[data-ega-retry]') as HTMLElement;
    expect(btn.textContent.trim()).toBe('Try again (wait for the current reply)');
    await fireEvent.click(btn);
    expect(props.onRetry).not.toHaveBeenCalled();
  });

  it('a reply with nothing to replay offers no Try again', () => {
    const { container } = render(AssistantTurn, {
      props: replyProps(failed('NETWORK', 'x'), { canRetry: false }),
    });
    expect(container.querySelector('[data-ega-retry]')).toBeNull();
  });

  it('a stop is not an error: muted "Stopped", a status, and a ghost Try again', () => {
    const { container } = render(AssistantTurn, {
      props: replyProps(failed('ABORTED', 'cancelled')),
    });
    const stopped = container.querySelector('[data-ega-cancelled]');
    expect(stopped?.textContent).toBe('Stopped');
    expect(stopped?.getAttribute('role')).toBe('status');
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(buttons(container)).toEqual(['Try again']);
  });

  it('a reply cut off by the panel closing says so', () => {
    const { container } = render(AssistantTurn, {
      props: replyProps(failed('interrupted', 'The panel reloaded before this finished.')),
    });
    expect(container.querySelector('.ega-error-title')?.textContent.trim()).toBe(
      'Reply interrupted',
    );
    expect(buttons(container)).toEqual(['Try again']);
  });

  it('a partial answer shows its text, "Partial answer", and Copy in the error row', async () => {
    const write = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
    const { container } = render(AssistantTurn, {
      props: replyProps(failed('PROTOCOL', 'closed', { content: 'Once upon a' })),
    });
    expect(container.querySelector('.ega-answer')?.textContent).toContain('Once upon a');
    expect(metaText(container)[0]).toBe('Partial answer');
    await fireEvent.click(
      container.querySelector('.ega-error-actions [data-ega-action="copy"]') as HTMLElement,
    );
    expect(write).toHaveBeenCalledWith('Once upon a');
  });
});

describe('Open settings goes where the fix is', () => {
  it('a max-tokens cut opens the tab that holds the length setting', async () => {
    const { container } = render(AssistantTurn, {
      props: replyProps(failed('REQUEST', 'The answer hit the max-tokens limit set in Settings.')),
    });
    expect(container.querySelector('.ega-error-title')?.textContent.trim()).toBe('Answer too long');
    await fireEvent.click(
      container.querySelector('[data-ega-sidepanel-open-options]') as HTMLElement,
    );
    expect(openOptionsTab).toHaveBeenCalledWith('translate');
  });
});
