import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRouter } from '@/background/router';
import { baseDeps } from '@tests/_helpers/router';
import { testManifest } from '@tests/_helpers/backend';
import { asBackendIdUnsafe } from '@/shared/brands';
import type { TranslationBackend } from '@/shared/backends/base';
import type { TranslationChunk } from '@/shared/types';

const row = {
  id: 'c-image-list',
  label: 'Describe objects',
  createdAt: 1,
  system: 'Describe the objects in the picture.',
  user: '{{text}}',
  output: 'card' as const,
  pageContext: false,
  image: true,
  glossary: false,
  answer: {
    v: 1 as const,
    fields: [
      {
        key: 'objects',
        label: 'Objects',
        kind: 'list' as const,
        role: 'main' as const,
        required: true,
      },
      {
        key: 'reason',
        label: 'What I noticed',
        kind: 'text' as const,
        role: 'notes' as const,
        required: false,
      },
    ],
  },
};
describe('custom image menu tasks', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  it('runs the custom prompt and answer spec through vision', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), {
            headers: { 'content-type': 'image/png' },
          }),
      ),
    );
    const translate = vi.fn<TranslationBackend['translate']>();
    const translateImage = vi.fn<NonNullable<TranslationBackend['translateImage']>>(async (a) => {
      a.onChunk({
        type: 'delta',
        requestId: a.requestId,
        text: '{"objects":["A cat","A chair"],"reason":"On the left"}',
      });
      a.onChunk({ type: 'done', requestId: a.requestId });
    });
    const backend: TranslationBackend = {
      id: asBackendIdUnsafe('anthropic'),
      manifest: testManifest('anthropic', true),
      isAvailable: async () => true,
      translate,
      translateImage,
    };
    const router = createRouter(
      baseDeps({ backends: [backend], getCustomTasks: async () => [row] }),
    );
    const chunks: TranslationChunk[] = [];
    await router.handleImageTranslate(
      { id: 'custom-image', task: row.id, imageUrl: 'https://example.com/image.png' },
      (chunk) => chunks.push(chunk),
    );
    expect(translate).not.toHaveBeenCalled();
    expect(translateImage).toHaveBeenCalledTimes(1);
    expect(translateImage.mock.calls[0]?.[0].system).toContain(row.system);
    expect(chunks.find((c) => c.type === 'done')).toMatchObject({
      text: 'A cat\nA chair',
      answer: { spec: { id: `custom:${row.id}` } },
      notes: [{ label: 'What I noticed', text: 'On the left' }],
    });
  });
  describe('page context on an image request', () => {
    const context = { pageTitle: 'Oat drink 1 L, no added sugar', imageAlt: 'Back label' };
    const { answer: _answer, ...plain } = row;
    const labelCheck = {
      ...plain,
      id: 'c-label-check',
      system: 'Check the listing against the label photo.',
      user: 'Listing:\n{{context}}',
      pageContext: true,
    };

    async function promptFor(
      task: string,
      tasks: (typeof labelCheck)[],
    ): Promise<{ system: string; user: string; done: TranslationChunk | undefined }> {
      vi.stubGlobal(
        'fetch',
        vi.fn(
          async () =>
            new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), {
              headers: { 'content-type': 'image/png' },
            }),
        ),
      );
      const translateImage = vi.fn<NonNullable<TranslationBackend['translateImage']>>(async (a) => {
        a.onChunk({ type: 'delta', requestId: a.requestId, text: 'ok' });
        a.onChunk({ type: 'done', requestId: a.requestId });
      });
      const router = createRouter(
        baseDeps({
          backends: [
            {
              id: asBackendIdUnsafe('anthropic'),
              manifest: testManifest('anthropic', true),
              isAvailable: async () => true,
              translate: vi.fn(),
              translateImage,
            },
          ],
          getCustomTasks: async () => tasks,
        }),
      );
      const chunks: TranslationChunk[] = [];
      await router.handleImageTranslate(
        { id: `ctx-${task}`, task, imageUrl: 'https://example.com/label.png', context },
        (chunk) => chunks.push(chunk),
      );
      const args = translateImage.mock.calls[0]?.[0];
      return {
        system: args?.system ?? '',
        user: args?.user ?? '',
        done: chunks.find((c) => c.type === 'done'),
      };
    }

    it("fills a custom image task's {{context}} slot, and records that page info went", async () => {
      const sent = await promptFor(labelCheck.id, [labelCheck]);
      expect(sent.user).toContain('Title: Oat drink 1 L, no added sugar');
      expect(sent.user).toContain('Image alt text: "Back label"');
      expect(sent.done).toMatchObject({ meta: { pageContextSent: true, imageArm: 'task' } });
    });

    it("sends none when the task's own page context switch is off", async () => {
      const sent = await promptFor(labelCheck.id, [{ ...labelCheck, pageContext: false }]);
      expect(`${sent.system}\n${sent.user}`).not.toContain('Oat drink');
      expect(sent.done).toMatchObject({ meta: { pageContextSent: false } });
    });

    it('the built-in image Translate keeps its image prompt, which takes no page info', async () => {
      const sent = await promptFor('translate', []);
      expect(`${sent.system}\n${sent.user}`).not.toContain('Oat drink');
      expect(sent.done).toMatchObject({ meta: { pageContextSent: false, imageArm: 'ocr' } });
    });
  });

  it('refuses a stale image menu item whose task no longer reads images', async () => {
    const translate = vi.fn<TranslationBackend['translate']>();
    const router = createRouter(
      baseDeps({
        getCustomTasks: async () => [{ ...row, image: false }],
        backends: [
          {
            id: asBackendIdUnsafe('anthropic'),
            manifest: testManifest('anthropic', true),
            isAvailable: async () => true,
            translate,
          },
        ],
      }),
    );
    const chunks: TranslationChunk[] = [];
    await router.handleImageTranslate(
      { id: 'stale-image', task: row.id, imageUrl: 'data:image/png;base64,iVBORw0KGgo=' },
      (chunk) => chunks.push(chunk),
    );
    expect(chunks).toMatchObject([{ type: 'error', code: 'UNSUPPORTED' }]);
    expect(translate).not.toHaveBeenCalled();
  });
});
