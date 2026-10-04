// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import BackendCard from '@/options/components/BackendCard.svelte';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { asBackendIdUnsafe } from '@/shared/brands';
import { resolveBackend } from '@/shared/backends/registry';
import type { Settings } from '@/shared/types';

async function settle(): Promise<void> {
  for (let i = 0; i < 10; i += 1) {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  }
}

describe('BackendCard test row', () => {
  it('shows the error label a user can read, not the raw code', async () => {
    const s = structuredClone(DEFAULT_SETTINGS) as Settings;
    s.anthropicApiKey = 'sk-ant-test';
    const backend = resolveBackend(asBackendIdUnsafe('anthropic'));
    if (!backend) throw new Error('anthropic backend not registered');
    const origAvailable = backend.isAvailable;
    const origTranslate = backend.translate;
    backend.isAvailable = async () => true;
    backend.translate = async ({ req, onChunk }) => {
      onChunk({ type: 'error', requestId: req.id, code: 'RATE_LIMIT', message: 'slow down' });
    };
    try {
      const { container } = render(BackendCard, {
        props: {
          id: asBackendIdUnsafe('anthropic'),
          label: 'Anthropic',
          settings: s,
        },
      });
      await settle();
      container.querySelector<HTMLButtonElement>('.be-test-btn')?.click();
      await settle();
      const result = container.querySelector('.be-testresult')?.textContent ?? '';
      expect(result).toBe('Rate limit reached: slow down');
    } finally {
      backend.isAvailable = origAvailable;
      backend.translate = origTranslate;
    }
  });

  it('shows the answer of a model that reasons in its reply, not the reasoning', async () => {
    const s = structuredClone(DEFAULT_SETTINGS) as Settings;
    const backend = resolveBackend(asBackendIdUnsafe('ollama'));
    if (!backend) throw new Error('ollama backend not registered');
    const origAvailable = backend.isAvailable;
    const origTranslate = backend.translate;
    backend.isAvailable = async () => true;
    backend.translate = async ({ req, onChunk }) => {
      onChunk({ type: 'delta', requestId: req.id, text: '<think>\nOkay, the user wants' });
      onChunk({ type: 'delta', requestId: req.id, text: ' English.</think>\nHello, my dear' });
      onChunk({ type: 'done', requestId: req.id });
    };
    try {
      const { container } = render(BackendCard, {
        props: { id: asBackendIdUnsafe('ollama'), label: 'Ollama', settings: s },
      });
      await settle();
      container.querySelector<HTMLButtonElement>('.be-test-btn')?.click();
      await settle();
      const result = container.querySelector('.be-testresult')?.textContent ?? '';
      expect(result).toBe('Hello, my dear');
    } finally {
      backend.isAvailable = origAvailable;
      backend.translate = origTranslate;
    }
  });
});
