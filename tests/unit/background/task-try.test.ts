import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTaskTryHandler } from '@/background/task-try';
import { baseDeps, mkSettings } from '@tests/_helpers/router';
import { buildCustomPreviewPrompt } from '@/options/preview-prompt';
import { materializeVarieties } from '@/shared/varieties';
import { testManifest } from '@tests/_helpers/backend';
import type { TranslateCallArgs, TranslationBackend } from '@/shared/backends/base';
import type { Msg } from '@/shared/messages';
import { asBackendIdUnsafe } from '@/shared/brands';
import { sel } from '@tests/_helpers/lang';
import { getPerfEntries, clearPerfBuffer } from '@/shared/perf-history';

const { audit } = vi.hoisted(() => ({ audit: vi.fn() }));
vi.mock('@/shared/audit-log', async (original) => ({
  ...(await original<object>()),
  pushAuditEntry: audit,
}));

const message: Extract<Msg, { kind: 'task:try' }> = {
  kind: 'task:try',
  requestId: 'draft-test',
  text: 'Some sample text',
  sourceLang: 'auto',
  targetLang: sel('en'),
  draft: {
    label: 'Outline',
    system: 'Make an outline.',
    user: '{{text}}',
    output: 'card',
    pageContext: false,
    image: false,
    glossary: false,
    answer: {
      v: 1,
      fields: [
        { key: 'outline', label: 'Outline', role: 'main', kind: 'list', required: true },
        { key: 'why', label: 'Reason', role: 'notes', kind: 'text', required: false },
      ],
    },
  },
};
function handler(translate: TranslationBackend['translate']) {
  const backend: TranslationBackend = {
    id: asBackendIdUnsafe('anthropic'),
    manifest: testManifest('anthropic'),
    isAvailable: async () => true,
    translate,
  };
  return createTaskTryHandler(baseDeps({ backends: [backend] }));
}
beforeEach(() => {
  audit.mockClear();
  clearPerfBuffer();
});
describe('trying an unsaved task', () => {
  it('uses its draft fields and returns reply details without durable records', async () => {
    const calls: TranslateCallArgs[] = [];
    const h = handler(async (a) => {
      calls.push(a);
      a.onChunk({
        type: 'delta',
        requestId: a.req.id,
        text: JSON.stringify({ outline: ['One', 'Two'], why: 'A reason' }),
      });
      a.onChunk({ type: 'done', requestId: a.req.id });
    });
    const result = await h.run(message, true);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.system).toContain('outline');
    expect(result).toMatchObject({
      type: 'done',
      text: 'One\nTwo',
      notes: [{ label: 'Reason' }],
      answer: { fields: { outline: ['One', 'Two'] } },
    });
    expect(result.type === 'done' && result.meta?.instructions).toContain('Make an outline.');
    expect(audit).not.toHaveBeenCalled();
    expect(getPerfEntries()).toEqual([]);
  });
  it('sends the prompt the Preview shows, rules scoped to the saved task included', async () => {
    const base = mkSettings();
    const rule = {
      id: 'r1',
      body: 'Keep it short.',
      category: 'always' as const,
      scope: { tasks: ['saved-1'] },
      source: 'manual' as const,
      addedAt: '2026-01-01T00:00:00.000Z',
      enabled: true,
    };
    const s = mkSettings({ advanced: { ...base.advanced, rules: [rule] } });
    const calls: TranslateCallArgs[] = [];
    const backend: TranslationBackend = {
      id: asBackendIdUnsafe('anthropic'),
      manifest: testManifest('anthropic'),
      isAvailable: async () => true,
      translate: async (a) => {
        calls.push(a);
        a.onChunk({ type: 'delta', requestId: a.req.id, text: '{"outline": ["One"]}' });
        a.onChunk({ type: 'done', requestId: a.req.id });
      },
    };
    const h = createTaskTryHandler(baseDeps({ backends: [backend], getSettings: async () => s }));
    await h.run({ ...message, taskId: 'saved-1' }, true);
    const preview = buildCustomPreviewPrompt(s, {
      id: 'saved-1',
      row: message.draft,
      text: message.text,
      sourceLang: 'auto',
      targetLang: sel('en'),
      varieties: materializeVarieties(s, []),
    });
    expect(preview.system).toContain('Keep it short.');
    expect({ system: calls[0]?.system, user: calls[0]?.user }).toEqual(preview);
  });
  it('rejects content-page callers and invalid drafts before making a backend call', async () => {
    const translate = vi.fn<TranslationBackend['translate']>();
    const h = handler(translate);
    expect(await h.run(message, false)).toMatchObject({ type: 'error', code: 'REQUEST' });
    expect(await h.run({ ...message, draft: { ...message.draft, label: '' } }, true)).toMatchObject(
      {
        type: 'error',
        code: 'REQUEST',
        message: 'Check the task name, message and reply fields before trying it.',
      },
    );
    expect(await h.run({ ...message, text: '' }, true)).toMatchObject({
      type: 'error',
      code: 'REQUEST',
    });
    expect(translate).not.toHaveBeenCalled();
  });
  it('cancels an active test and releases its request ID', async () => {
    const translate = vi.fn<TranslationBackend['translate']>(
      async (a) =>
        new Promise<void>((resolve) => {
          a.cancel.signal.addEventListener('abort', () => resolve(), { once: true });
        }),
    );
    const h = handler(translate);
    const run = h.run(message, true);
    await vi.waitFor(() => expect(translate).toHaveBeenCalledTimes(1));
    expect(await h.run(message, true)).toMatchObject({
      code: 'REQUEST',
      message: 'This task test is already running.',
    });
    h.cancel(message.requestId);
    await run;
    const next = h.run(message, true);
    await vi.waitFor(() => expect(translate).toHaveBeenCalledTimes(2));
    h.cancel(message.requestId);
    await next;
  });
});
