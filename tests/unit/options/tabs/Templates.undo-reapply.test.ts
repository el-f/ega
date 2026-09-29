// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { resetChromeMock, chromeMock } from '../../../mocks/chrome';
import { parseSettings } from '@/shared/settings-schema';
import { toastStore, type ToastMsg } from '@/shared/components/toastStore';
import type { Settings } from '@/shared/types';
import type { RecipeApplySnapshot, TemplatesHandlers } from '@/options/templates-handlers';
import { makeMockHandlers } from '../_mock-templates-handlers';

vi.mock('@/options/templates-handlers', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  createTemplatesHandlers: () => handlers,
}));

import Templates from '@/options/tabs/Templates.svelte';

// The first apply sees the user's values; the second sees the recipe's own and adds no rule.
const FIRST: RecipeApplySnapshot = {
  recipeId: 'r',
  task: 'translate',
  addedRuleIds: ['rule-a'],
  template: undefined,
  tone: undefined,
  temperature: undefined,
  maxTokens: undefined,
  applied: { temperature: 0.5 },
};
const SECOND: RecipeApplySnapshot = {
  ...FIRST,
  addedRuleIds: [],
  temperature: 0.5,
};

let handlers: TemplatesHandlers = makeMockHandlers();
let pushed: ToastMsg[] = [];

function must<T>(v: T | null | undefined, what: string): T {
  if (v === null || v === undefined) throw new Error(`missing ${what}`);
  return v;
}

function seedDefaults(): Settings {
  const defaults = parseSettings({});
  chromeMock.storage.local._raw.set('ega.settings', defaults);
  return defaults;
}

async function applyRecipe(container: HTMLElement, expectedToasts: number): Promise<ToastMsg> {
  // The gallery is a lazy chunk; under a full suite run it can take more than waitFor's 1 s default.
  const card = await waitFor(
    () => must(container.querySelector<HTMLElement>('[data-ega-recipe-card]'), 'recipe card'),
    { timeout: 5000 },
  );
  await fireEvent.click(
    must(card.querySelector<HTMLButtonElement>('[data-ega-recipe-apply]'), 'apply button'),
  );
  await fireEvent.click(
    must(
      Array.from(document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')).find(
        (b) => b.textContent.trim() === 'Apply',
      ),
      'dialog apply button',
    ),
  );
  await waitFor(() => expect(pushed).toHaveLength(expectedToasts));
  return must(pushed.at(-1), 'applied toast');
}

describe('Templates tab — applying the same recipe twice keeps the first snapshot', () => {
  beforeEach(() => {
    resetChromeMock();
    pushed = [];
    vi.spyOn(toastStore, 'push').mockImplementation((m) => {
      pushed.push(m);
    });
    handlers = makeMockHandlers({
      applyRecipeFull: vi.fn().mockResolvedValueOnce(FIRST).mockResolvedValueOnce(SECOND),
      undoRecipeApply: vi.fn().mockResolvedValue(true),
    });
  });

  it('undoes with the pre-recipe values and every rule id both applies added', async () => {
    const { container } = render(Templates, {
      props: { s: seedDefaults(), onSetSettings: () => {} },
    });
    await fireEvent.click(
      must(
        container.querySelector<HTMLButtonElement>('[data-ega-workbench-chip="recipes"]'),
        'recipes chip',
      ),
    );
    await applyRecipe(container, 1);
    const second = await applyRecipe(container, 2);

    must(second.action, 'undo action').onClick();

    await waitFor(() => expect(handlers.undoRecipeApply).toHaveBeenCalledTimes(1));
    expect(handlers.undoRecipeApply).toHaveBeenCalledWith({
      ...FIRST,
      addedRuleIds: ['rule-a'],
    });
  });
});
