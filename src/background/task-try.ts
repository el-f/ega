import * as v from 'valibot';
import { createRouter, type RouterDeps } from './router';
import { customTaskSchema } from '@/shared/settings-schema';
import type { Msg } from '@/shared/messages';
import type { TranslationChunk } from '@/shared/types';
import { MAX_SELECTION_CHARS } from '@/shared/constants';

type TaskTry = Extract<Msg, { kind: 'task:try' }>;
type Terminal = Extract<TranslationChunk, { type: 'done' | 'error' }>;

/** Each draft gets an isolated router: no stored row, conversation, audit or cache. */
export function createTaskTryHandler(
  deps: Omit<RouterDeps, 'cache' | 'getCustomTasks' | 'record'>,
) {
  const running = new Map<string, ReturnType<typeof createRouter>>();
  return {
    cancel(requestId: string): void {
      running.get(requestId)?.cancel(requestId);
    },
    async run(msg: TaskTry, extensionPage: boolean): Promise<Terminal> {
      const fail = (message: string): Terminal => ({
        type: 'error',
        requestId: msg.requestId,
        code: 'REQUEST',
        message,
      });
      if (!extensionPage) return fail('Task tests can only run from Settings.');
      if (typeof msg.text !== 'string' || !msg.text.trim() || msg.text.length > MAX_SELECTION_CHARS)
        return fail('Add sample text to try this task.');
      if (running.has(msg.requestId)) return fail('This task test is already running.');
      const id = `preview-${msg.requestId}`;
      const row = v.safeParse(customTaskSchema, { ...msg.draft, id, createdAt: Date.now() });
      if (!row.success)
        return fail('Check the task name, message and answer fields before trying it.');
      const router = createRouter({
        ...deps,
        record: false,
        getSettings: async () => {
          const s = await deps.getSettings();
          return {
            ...s,
            cacheEnabled: false,
            captureResultMeta: true,
            disabledTasks: s.disabledTasks.filter((task) => task !== id),
          };
        },
        getCustomTasks: () => Promise.resolve([row.output]),
        cache: { get: () => Promise.resolve(undefined), set: () => Promise.resolve() },
      });
      running.set(msg.requestId, router);
      let terminal: Terminal = fail('Ega could not finish this test. Try again.');
      try {
        await router.handleTranslate(
          {
            id: msg.requestId,
            text: msg.text,
            sourceLang: msg.sourceLang,
            targetLang: msg.targetLang,
            options: { task: id, stream: false, explain: false },
          },
          (chunk) => {
            if (chunk.type !== 'delta') terminal = chunk;
          },
        );
        return terminal;
      } catch {
        return {
          type: 'error',
          requestId: msg.requestId,
          code: 'UNKNOWN',
          message: 'Ega could not finish this test. Try again.',
        };
      } finally {
        running.delete(msg.requestId);
      }
    },
  };
}
