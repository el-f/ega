// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, waitFor } from '@testing-library/svelte';
import { chromeMock, resetChromeMock } from '../../mocks/chrome';
import type { BackendId } from '@/shared/brands';

import { flushAsync } from '@tests/_helpers/async';

vi.mock('@/shared/components/confirmDialog', () => ({ confirmDialog: vi.fn(async () => true) }));
const push = vi.fn();
vi.mock('@/shared/components/toastStore', () => ({ toastStore: { push, dismiss: vi.fn() } }));

const { default: RequestAuditLog } = await import('@/options/components/RequestAuditLog.svelte');

const defaultSendMessage = chromeMock.runtime.sendMessage;

async function renderWithOneEntry() {
  await chrome.storage.local.set({
    egaAuditLog: {
      version: 1,
      entries: [
        {
          id: 'a',
          ts: Date.now(),
          task: 'translate',
          sourceLang: 'auto',
          targetLang: 'en',
          backend: 'anthropic' as BackendId,
          model: 'm',
          systemPrompt: 's',
          userPrompt: 'u',
          response: 'r',
          latencyMs: 1,
          cacheHit: false,
        },
      ],
    },
  });
  const view = render(RequestAuditLog);
  const btn = await waitFor(() => {
    const b = view.container.querySelector<HTMLButtonElement>('[data-ega-audit-clear]');
    if (!b) throw new Error('clear button not ready');
    return b;
  });
  return { ...view, btn };
}

describe('RequestAuditLog — Clear', () => {
  beforeEach(() => {
    resetChromeMock();
    chromeMock.runtime.sendMessage = defaultSendMessage;
    push.mockReset();
  });

  it('says so when the worker could not clear the log', async () => {
    chromeMock.runtime.sendMessage = vi.fn(async () => ({ ok: false }));
    const { btn } = await renderWithOneEntry();
    btn.click();
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Could not clear the request list', variant: 'danger' }),
      ),
    );
  });

  it('says so when the worker cannot be reached', async () => {
    chromeMock.runtime.sendMessage = vi.fn(() => Promise.reject(new Error('No SW')));
    const { btn } = await renderWithOneEntry();
    btn.click();
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Could not clear the request list', variant: 'danger' }),
      ),
    );
  });

  it('the failure toast offers Try again, which runs the clear again', async () => {
    const send = vi.fn(async (_msg: unknown): Promise<unknown> => ({ ok: false }));
    chromeMock.runtime.sendMessage = send;
    const { btn } = await renderWithOneEntry();
    btn.click();
    await waitFor(() => expect(push).toHaveBeenCalledTimes(1));
    const action = (push.mock.calls[0]?.[0] as { action?: { label: string; onClick: () => void } })
      .action;
    expect(action?.label).toBe('Try again');
    action?.onClick();
    await waitFor(() =>
      expect(
        send.mock.calls.filter((c) => (c[0] as { kind?: string }).kind === 'audit:clear'),
      ).toHaveLength(2),
    );
  });

  it('shows no error when the clear worked', async () => {
    chromeMock.runtime.sendMessage = vi.fn(async () => ({ ok: true }));
    const { btn } = await renderWithOneEntry();
    btn.click();
    await waitFor(() =>
      expect(chromeMock.runtime.sendMessage).toHaveBeenCalledWith({ kind: 'audit:clear' }),
    );
    // The error toast is decided the moment the reply resolves, so one flush is enough to see it.
    await flushAsync();
    expect(push).not.toHaveBeenCalled();
  });
});
