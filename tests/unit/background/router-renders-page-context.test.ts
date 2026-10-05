import { describe, it, expect } from 'vitest';
import { rendersPageContext } from '@/background/router-context';
import type { PromptTemplate, TranslationRequest } from '@/shared/types';

type Ctx = Parameters<typeof rendersPageContext>[0];

function ctx(over: {
  context?: TranslationRequest['context'];
  tpl: PromptTemplate;
  snippets?: Record<string, string>;
  contextBlockIfNoSlot?: boolean;
}): Ctx {
  return {
    reqView: { ...(over.context ? { context: over.context } : {}) },
    tpl: over.tpl,
    snippets: over.snippets ?? {},
    contextBlockIfNoSlot: over.contextBlockIfNoSlot ?? false,
  } as unknown as Ctx;
}

const page = { pageTitle: 'Forum' };

describe('rendersPageContext — the details panel says page info went only when the prompt carried it', () => {
  it('is true for a template with a {{context}} slot', () => {
    expect(
      rendersPageContext(ctx({ context: page, tpl: { system: 's', user: '{{context}}' } })),
    ).toBe(true);
  });

  it('is true for a slot inside a snippet', () => {
    expect(
      rendersPageContext(
        ctx({
          context: page,
          tpl: { system: '@@page@@', user: 'u' },
          snippets: { page: 'Around: {{context}}' },
        }),
      ),
    ).toBe(true);
  });

  it('is false for an edited template with no slot', () => {
    expect(rendersPageContext(ctx({ context: page, tpl: { system: 's', user: '{{text}}' } }))).toBe(
      false,
    );
  });

  it('is true for a slotless task that gets the context block', () => {
    expect(
      rendersPageContext(
        ctx({ context: page, tpl: { system: 's', user: 'u' }, contextBlockIfNoSlot: true }),
      ),
    ).toBe(true);
  });

  it('is false when the request kept no page info', () => {
    expect(rendersPageContext(ctx({ tpl: { system: 's', user: '{{context}}' } }))).toBe(false);
  });
});
