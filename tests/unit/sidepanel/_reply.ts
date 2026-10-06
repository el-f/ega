import { vi } from 'vitest';
import { fireEvent, waitFor } from '@testing-library/svelte';
import type { AssistantTurnData } from '@/sidepanel/state/conversation';
import type { ResultMeta } from '@/shared/types';

export function meta(over: Partial<ResultMeta> = {}): ResultMeta {
  return {
    backendId: 'anthropic' as ResultMeta['backendId'],
    cacheHit: false,
    latencyMs: 1200,
    firstTokenMs: 400,
    modelId: 'claude-haiku-4-5-20251001',
    inputTokens: 42,
    outputTokens: 9,
    ...over,
  };
}

/** A finished Translate answer with one version, the shape the store loads. */
export function doneReply(over: Partial<AssistantTurnData> = {}): AssistantTurnData {
  const base: AssistantTurnData = {
    id: 'a1',
    role: 'assistant',
    kind: 'translate',
    status: 'done',
    content: 'Hello, friend.',
    createdAt: 1,
    attachedToTurnId: 'u1',
    detectedLang: 'es',
    confidence: 0.93,
    meta: meta(),
    ...over,
  };
  return {
    ...base,
    variants: over.variants ?? [
      {
        id: `${base.id}:v1`,
        status: base.status,
        content: base.content,
        ...(base.meta ? { meta: base.meta } : {}),
        ...(base.detectedLang !== undefined ? { detectedLang: base.detectedLang } : {}),
      },
    ],
    activeVariantIdx: over.activeVariantIdx ?? 0,
  };
}

export function replyProps(turn: AssistantTurnData, over: Record<string, unknown> = {}) {
  return {
    turn,
    onRetry: vi.fn(),
    onRefine: vi.fn(() => true),
    onRegenerate: vi.fn(),
    onBookmark: vi.fn(),
    onDelete: vi.fn(),
    onSelectVariant: vi.fn(),
    onSwap: vi.fn(),
    onTaskSwitch: vi.fn(),
    onTranslateInto: vi.fn(),
    onDescribeChange: vi.fn(),
    isLatest: true,
    sourceLang: 'auto' as never,
    targetLang: 'en' as never,
    ...over,
  };
}

/** Opens the reply's Refine or More menu from the keyboard; bits renders it in a portal. */
export async function openMenu(
  container: HTMLElement,
  action: 'refine' | 'more',
): Promise<HTMLElement> {
  // Scoped to the reply: a user message has its own More.
  const trigger = container.querySelector<HTMLElement>(
    `[data-ega-reply] [data-ega-action="${action}"]`,
  );
  if (!trigger) throw new Error(`${action} trigger missing`);
  await fireEvent.keyDown(trigger, { key: 'Enter' });
  return waitFor(() => {
    const menu = document.querySelector<HTMLElement>('[role="menu"]');
    if (!menu) throw new Error('menu not open');
    return menu;
  });
}

export const metaText = (container: HTMLElement): string[] =>
  Array.from(container.querySelectorAll('[data-ega-meta-item]')).map((e) => e.textContent.trim());
