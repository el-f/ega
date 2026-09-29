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

const SNAP: RecipeApplySnapshot = {
  recipeId: 'r',
  task: 'translate',
  addedRuleIds: [],
  template: undefined,
  tone: undefined,
  temperature: undefined,
  maxTokens: undefined,
  applied: {},
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

/** Mounts the tab, opens the recipes chip, applies the first recipe and returns its Undo action. */
async function applyFirstRecipe(): Promise<ToastMsg> {
  const { container } = render(Templates, {
    props: { s: seedDefaults(), onSetSettings: () => {} },
  });
  await fireEvent.click(
    must(
      container.querySelector<HTMLButtonElement>('[data-ega-workbench-chip="recipes"]'),
      'recipes chip',
    ),
  );
  const card = await waitFor(() =>
    must(container.querySelector<HTMLElement>('[data-ega-recipe-card]'), 'recipe card'),
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
  await waitFor(() => expect(pushed).toHaveLength(1));
  return must(pushed[0], 'applied toast');
}

describe('Templates tab — an undo that did not land stays retryable', () => {
  beforeEach(() => {
    resetChromeMock();
    pushed = [];
    vi.spyOn(toastStore, 'push').mockImplementation((m) => {
      pushed.push(m);
    });
    handlers = makeMockHandlers({
      applyRecipeFull: vi.fn().mockResolvedValue(SNAP),
      undoRecipeApply: vi.fn().mockResolvedValue(false),
    });
  });

  it('re-offers Undo with the same snapshot when the undo write fails', async () => {
    const applied = await applyFirstRecipe();
    must(applied.action, 'undo action').onClick();

    const retry = await waitFor(() => {
      const last = pushed.at(-1);
      if (!last?.action || last === applied) throw new Error('no retry toast yet');
      return last;
    });
    must(retry.action, 'retry action').onClick();

    await waitFor(() => expect(handlers.undoRecipeApply).toHaveBeenCalledTimes(2));
    expect(vi.mocked(handlers.undoRecipeApply).mock.calls.every(([s]) => s === SNAP)).toBe(true);
  });

  it('drops the snapshot once the undo write lands, so a second Undo is a no-op', async () => {
    handlers.undoRecipeApply = vi.fn().mockResolvedValue(true);
    const applied = await applyFirstRecipe();
    must(applied.action, 'undo action').onClick();

    await waitFor(() => expect(handlers.undoRecipeApply).toHaveBeenCalledTimes(1));
    must(applied.action, 'undo action').onClick();
    await new Promise((r) => setTimeout(r, 20));
    expect(handlers.undoRecipeApply).toHaveBeenCalledTimes(1);
    expect(pushed).toHaveLength(1);
  });
});
