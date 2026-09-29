// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/svelte';
import AuditDiffModal from '@/options/components/AuditDiffModal.svelte';
import type { AuditEntry } from '@/shared/audit-log';
import type { BackendId } from '@/shared/brands';

function makeEntry(o: Partial<AuditEntry> = {}): AuditEntry {
  return {
    id: o.id ?? 'e1',
    ts: o.ts ?? 1700000000000,
    task: o.task ?? 'translate',
    sourceLang: o.sourceLang ?? 'auto',
    targetLang: o.targetLang ?? 'en',
    backend: o.backend ?? ('anthropic' as BackendId),
    model: o.model ?? 'claude-test',
    systemPrompt: o.systemPrompt ?? 'sys-text',
    userPrompt: o.userPrompt ?? 'usr-text',
    response: o.response ?? 'resp-text',
    latencyMs: o.latencyMs ?? 100,
    cacheHit: o.cacheHit ?? false,
    ...(o.error ? { error: o.error } : {}),
  };
}

const fmtTs = (n: number) => new Date(n).toISOString();
const fmtLat = (ms: number) => `${ms}ms`;

describe('AuditDiffModal', () => {
  it('renders both sides with system/user/response blocks', () => {
    const left = makeEntry({
      id: 'L',
      systemPrompt: 'sys-L',
      userPrompt: 'usr-L',
      response: 'resp-L',
    });
    const right = makeEntry({
      id: 'R',
      systemPrompt: 'sys-R',
      userPrompt: 'usr-R',
      response: 'resp-R',
    });
    render(AuditDiffModal, {
      props: { left, right, onClose: vi.fn(), formatTs: fmtTs, formatLatency: fmtLat },
    });
    expect(document.querySelector('[data-ega-diff-system-left]')?.textContent).toBe('sys-L');
    expect(document.querySelector('[data-ega-diff-user-left]')?.textContent).toBe('usr-L');
    expect(document.querySelector('[data-ega-diff-response-left]')?.textContent).toBe('resp-L');
    expect(document.querySelector('[data-ega-diff-system-right]')?.textContent).toBe('sys-R');
    expect(document.querySelector('[data-ega-diff-user-right]')?.textContent).toBe('usr-R');
    expect(document.querySelector('[data-ega-diff-response-right]')?.textContent).toBe('resp-R');
  });

  it('Close button + header × both call onClose', async () => {
    const onClose = vi.fn();
    render(AuditDiffModal, {
      props: {
        left: makeEntry(),
        right: makeEntry(),
        onClose,
        formatTs: fmtTs,
        formatLatency: fmtLat,
      },
    });
    const headerClose = document.querySelector('.ega-dialog-close') as HTMLButtonElement;
    await fireEvent.click(headerClose);
    const footerClose = document.querySelector('.ega-dialog-actions button') as HTMLButtonElement;
    await fireEvent.click(footerClose);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('renders "Pin left & pick again" only when onPinLeftAndPickAgain is wired', async () => {
    const onPinLeftAndPickAgain = vi.fn();
    render(AuditDiffModal, {
      props: {
        left: makeEntry(),
        right: makeEntry(),
        onClose: vi.fn(),
        onPinLeftAndPickAgain,
        formatTs: fmtTs,
        formatLatency: fmtLat,
      },
    });
    const btn = document.querySelector('[data-ega-diff-pin-left]') as HTMLButtonElement | null;
    expect(btn).not.toBeNull();
    if (btn) {
      await fireEvent.click(btn);
      expect(onPinLeftAndPickAgain).toHaveBeenCalledOnce();
    }
  });

  it('omits "Pin left & pick again" when no callback supplied', () => {
    render(AuditDiffModal, {
      props: {
        left: makeEntry(),
        right: makeEntry(),
        onClose: vi.fn(),
        formatTs: fmtTs,
        formatLatency: fmtLat,
      },
    });
    expect(document.querySelector('[data-ega-diff-pin-left]')).toBeNull();
  });

  it('error entry surfaces error line in meta block', () => {
    const left = makeEntry({
      id: 'L',
      error: { code: 'AUTH', message: 'no key' },
    });
    render(AuditDiffModal, {
      props: { left, right: makeEntry(), onClose: vi.fn(), formatTs: fmtTs, formatLatency: fmtLat },
    });
    const metaLeft = document.querySelector('[data-ega-diff-meta-left]');
    expect(metaLeft?.textContent).toMatch(/AUTH/);
    expect(metaLeft?.textContent).toMatch(/no key/);
  });
});
