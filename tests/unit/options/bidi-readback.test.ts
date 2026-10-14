// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, waitFor } from '@testing-library/svelte';
import { resetChromeMock, chromeMock } from '../../mocks/chrome';
import { parseSettings } from '@/shared/settings-schema';
import RequestAuditLogEntryBody from '@/options/components/RequestAuditLogEntryBody.svelte';
import AuditDiffModal from '@/options/components/AuditDiffModal.svelte';
import Glossary from '@/options/tabs/Glossary.svelte';
import type { AuditEntry } from '@/shared/audit-log';
import type { BackendId } from '@/shared/brands';

// The audit panes and the glossary rows read text back to the user, so the order is the point.

const HEB = 'שלום עולם';

function entry(o: Partial<AuditEntry> = {}): AuditEntry {
  return {
    id: 'e1',
    ts: 1700000000000,
    task: 'translate',
    sourceLang: 'auto',
    targetLang: 'he',
    backend: 'anthropic' as BackendId,
    model: 'claude-test',
    systemPrompt: HEB,
    userPrompt: HEB,
    response: HEB,
    latencyMs: 100,
    cacheHit: false,
    ...o,
  };
}

const fmtLat = (ms: number): string => `${ms}ms`;

describe('audit read-back panes carry dir="auto"', () => {
  it('the entry body system / user / response panes', () => {
    const { container } = render(RequestAuditLogEntryBody, {
      props: { entry: entry(), formatLatency: fmtLat },
    });
    for (const sel of ['data-ega-audit-system', 'data-ega-audit-user', 'data-ega-audit-response']) {
      expect(container.querySelector(`[${sel}]`)?.getAttribute('dir')).toBe('auto');
    }
  });

  it('both sides of the diff modal', () => {
    render(AuditDiffModal, {
      props: {
        left: entry(),
        right: entry(),
        onClose: vi.fn(),
        formatTs: (n: number) => String(n),
        formatLatency: fmtLat,
      },
    });
    for (const side of ['left', 'right']) {
      for (const part of ['system', 'user', 'response']) {
        const el = document.querySelector(`[data-ega-diff-${part}-${side}]`);
        expect(el?.getAttribute('dir')).toBe('auto');
      }
    }
  });
});

describe('glossary rows carry dir="auto"', () => {
  beforeEach(() => {
    resetChromeMock();
  });

  it('term and translation cells follow their own text', async () => {
    chromeMock.storage.local._raw.set(
      'ega.settings',
      parseSettings({
        glossary: [{ term: HEB, translation: 'Hello world', caseSensitive: false }],
      }),
    );
    const { container } = render(Glossary);
    const row = await waitFor(() => {
      const el = container.querySelector('.glossary-row');
      expect(el).not.toBeNull();
      return el;
    });
    const cells = row?.querySelectorAll('.gl-pair > [dir]') ?? [];
    expect([...cells].map((c) => [c.textContent, c.getAttribute('dir')])).toEqual([
      [HEB, 'auto'],
      ['Hello world', 'auto'],
    ]);
  });
});
