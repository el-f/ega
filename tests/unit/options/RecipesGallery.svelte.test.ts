// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/svelte';
import RecipesGallery from '@/options/components/RecipesGallery.svelte';
import { BUNDLED_RECIPES, serialiseRecipe, type Recipe } from '@/shared/recipes';
import { toastStore, type ToastMsg } from '@/shared/components/toastStore';

vi.mock('@/shared/components/confirmDialog', () => ({
  confirmDialog: vi.fn(async () => true),
}));

const { confirmDialog } = await import('@/shared/components/confirmDialog');
const confirmMock = confirmDialog as unknown as Mock;

function must<T>(v: T | null | undefined, label: string): T {
  if (v == null) throw new Error(`Expected ${label} to be present`);
  return v;
}

function userRecipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    id: 'user-keep-emoji',
    task: 'translate',
    label: 'Keep emoji exactly',
    description: 'Preserve emoji from source verbatim.',
    rules: [{ body: 'Always preserve emoji verbatim.', category: 'always' }],
    ...overrides,
  };
}

function noopHandlers() {
  return {
    onApplyFull: vi.fn<(r: Recipe) => Promise<void>>().mockResolvedValue(undefined),
    onApplyRulesOnly: vi.fn<(r: Recipe) => Promise<void>>().mockResolvedValue(undefined),
    onSaveCurrentAs: vi
      .fn<(label: string, description: string, task: Recipe['task']) => Promise<void>>()
      .mockResolvedValue(undefined),
    onDeleteUserRecipe: vi.fn<(id: string) => Promise<void>>().mockResolvedValue(undefined),
    onImport: vi.fn<(encoded: string) => Promise<void>>().mockResolvedValue(undefined),
  };
}

describe('RecipesGallery', () => {
  beforeEach(() => {
    confirmMock.mockClear();
    confirmMock.mockResolvedValue(true);
  });

  it('tablist: active tab has tabindex=0, inactive has tabindex=-1', () => {
    const handlers = noopHandlers();
    const { container } = render(RecipesGallery, {
      props: { userRecipes: [], ...handlers },
    });
    const bundled = container.querySelector('[data-ega-recipes-tab="bundled"]');
    const yours = container.querySelector('[data-ega-recipes-tab="yours"]');
    expect(bundled?.getAttribute('tabindex')).toBe('0');
    expect(yours?.getAttribute('tabindex')).toBe('-1');
  });

  it('ArrowRight on tablist moves selection to next tab', async () => {
    const handlers = noopHandlers();
    const { container } = render(RecipesGallery, {
      props: { userRecipes: [userRecipe()], ...handlers },
    });
    const tablist = container.querySelector('[role="tablist"]') as HTMLElement;
    await fireEvent.keyDown(tablist, { key: 'ArrowRight' });
    const yours = container.querySelector('[data-ega-recipes-tab="yours"]');
    expect(yours?.getAttribute('aria-selected')).toBe('true');
  });

  it('renders bundled tab with bundled recipes grouped by task', () => {
    const handlers = noopHandlers();
    const { container } = render(RecipesGallery, {
      props: { userRecipes: [], ...handlers },
    });
    const bundledTab = container.querySelector<HTMLButtonElement>(
      '[data-ega-recipes-tab="bundled"]',
    );
    expect(bundledTab?.getAttribute('aria-selected')).toBe('true');

    const groups = container.querySelectorAll('[data-ega-recipes-group]');
    const taskAttrs = Array.from(groups).map((g) => g.getAttribute('data-ega-recipes-group'));
    expect(taskAttrs).toContain('translate');
    expect(taskAttrs).toContain('explain');
    expect(taskAttrs).toContain('suggest-replies');

    const cards = container.querySelectorAll('[data-ega-recipe-card]');
    expect(cards.length).toBe(BUNDLED_RECIPES.length);
  });

  it('bundled cards expose no Export or Delete affordance', () => {
    const handlers = noopHandlers();
    const { container } = render(RecipesGallery, {
      props: { userRecipes: [], ...handlers },
    });
    expect(container.querySelector('[data-ega-recipe-export]')).toBeNull();
    expect(container.querySelector('[data-ega-recipe-delete]')).toBeNull();
  });

  it('renders yours tab with user-authored recipes', async () => {
    const handlers = noopHandlers();
    const userRecipes = [
      userRecipe(),
      userRecipe({ id: 'user-eli5-extra', task: 'explain', label: 'Eli5 extra' }),
    ];
    const { container } = render(RecipesGallery, {
      props: { userRecipes, ...handlers },
    });
    const yoursTab = must(
      container.querySelector<HTMLButtonElement>('[data-ega-recipes-tab="yours"]'),
      'yours tab',
    );
    await fireEvent.click(yoursTab);

    const cards = container.querySelectorAll('[data-ega-recipe-card]');
    expect(cards.length).toBe(2);
    const ids = Array.from(cards).map((c) => c.getAttribute('data-ega-recipe-id'));
    expect(ids).toContain('user-keep-emoji');
    expect(ids).toContain('user-eli5-extra');
  });

  it('clicking [Apply] on a recipe opens structured-diff dialog; confirming dialog calls onApplyFull', async () => {
    const handlers = noopHandlers();
    const { container } = render(RecipesGallery, {
      props: { userRecipes: [], ...handlers },
    });

    const firstCard = must(
      container.querySelector<HTMLElement>('[data-ega-recipe-card]'),
      'first recipe card',
    );
    const applyBtn = must(
      firstCard.querySelector<HTMLButtonElement>('[data-ega-recipe-apply]'),
      'apply button',
    );
    await fireEvent.click(applyBtn);

    // Structured-diff dialog is in-component (not the shared confirmDialog),
    // so confirmMock is NOT called on this path.
    expect(confirmMock).not.toHaveBeenCalled();

    // Click the dialog's Apply button to commit.
    const dialogApply = must(
      Array.from(document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')).find(
        (b) => b.textContent.trim() === 'Apply',
      ),
      'dialog apply button',
    );
    await fireEvent.click(dialogApply);

    await waitFor(() => expect(handlers.onApplyFull).toHaveBeenCalledTimes(1));
    expect(handlers.onApplyRulesOnly).not.toHaveBeenCalled();
  });

  it('clicking [Add rules] calls onApplyRulesOnly without confirm', async () => {
    const handlers = noopHandlers();
    const { container } = render(RecipesGallery, {
      props: { userRecipes: [], ...handlers },
    });

    const firstCard = must(
      container.querySelector<HTMLElement>('[data-ega-recipe-card]'),
      'first recipe card',
    );
    const rulesOnlyBtn = must(
      firstCard.querySelector<HTMLButtonElement>('[data-ega-recipe-rules-only]'),
      'rules-only button',
    );
    await fireEvent.click(rulesOnlyBtn);

    await waitFor(() => expect(handlers.onApplyRulesOnly).toHaveBeenCalledTimes(1));
    expect(confirmMock).not.toHaveBeenCalled();
    expect(handlers.onApplyFull).not.toHaveBeenCalled();
  });

  it('rules that did not land add no toast of their own', async () => {
    const pushed: ToastMsg[] = [];
    const push = vi.spyOn(toastStore, 'push').mockImplementation((m) => {
      pushed.push(m);
    });
    const handlers = noopHandlers();
    handlers.onApplyRulesOnly.mockRejectedValue(new Error('rules were not added'));
    const { container } = render(RecipesGallery, {
      props: { userRecipes: [], ...handlers },
    });

    const firstCard = must(
      container.querySelector<HTMLElement>('[data-ega-recipe-card]'),
      'first recipe card',
    );
    await fireEvent.click(
      must(
        firstCard.querySelector<HTMLButtonElement>('[data-ega-recipe-rules-only]'),
        'rules-only button',
      ),
    );

    await waitFor(() => expect(handlers.onApplyRulesOnly).toHaveBeenCalledTimes(1));
    expect(pushed).toHaveLength(0);
    push.mockRestore();
  });

  it('clicking [Export] on a user recipe writes serialized payload to clipboard', async () => {
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
    const handlers = noopHandlers();
    const recipe = userRecipe();
    const { container } = render(RecipesGallery, {
      props: { userRecipes: [recipe], ...handlers },
    });
    const yoursTab = must(
      container.querySelector<HTMLButtonElement>('[data-ega-recipes-tab="yours"]'),
      'yours tab',
    );
    await fireEvent.click(yoursTab);

    const exportBtn = must(
      container.querySelector<HTMLButtonElement>('[data-ega-recipe-export]'),
      'export button',
    );
    await fireEvent.click(exportBtn);

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText).toHaveBeenCalledWith(serialiseRecipe(recipe));
    writeText.mockRestore();
  });

  it('clicking [Delete] on a user recipe confirms then calls onDeleteUserRecipe', async () => {
    const handlers = noopHandlers();
    const recipe = userRecipe();
    const { container } = render(RecipesGallery, {
      props: { userRecipes: [recipe], ...handlers },
    });
    const yoursTab = must(
      container.querySelector<HTMLButtonElement>('[data-ega-recipes-tab="yours"]'),
      'yours tab',
    );
    await fireEvent.click(yoursTab);

    const deleteBtn = must(
      container.querySelector<HTMLButtonElement>('[data-ega-recipe-delete]'),
      'delete button',
    );
    await fireEvent.click(deleteBtn);

    await waitFor(() => expect(confirmMock).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(handlers.onDeleteUserRecipe).toHaveBeenCalledWith('user-keep-emoji'),
    );
  });

  it('[+ New from current] opens form, submit calls onSaveCurrentAs', async () => {
    const handlers = noopHandlers();
    const { container } = render(RecipesGallery, {
      props: { userRecipes: [], ...handlers },
    });

    const newBtn = must(
      container.querySelector<HTMLButtonElement>('[data-ega-recipe-new]'),
      'new button',
    );
    await fireEvent.click(newBtn);

    const labelInput = must(
      container.querySelector<HTMLInputElement>('[data-ega-recipe-new-label]'),
      'label input',
    );
    const descInput = must(
      container.querySelector<HTMLTextAreaElement>('[data-ega-recipe-new-desc]'),
      'desc input',
    );
    const taskSelect = must(
      container.querySelector<HTMLSelectElement>('[data-ega-recipe-new-task]'),
      'task select',
    );

    await fireEvent.input(labelInput, { target: { value: 'My recipe' } });
    await fireEvent.input(descInput, { target: { value: 'My description' } });
    await fireEvent.change(taskSelect, { target: { value: 'reword' } });

    const saveBtn = must(
      container.querySelector<HTMLButtonElement>('[data-ega-recipe-new-save]'),
      'save button',
    );
    await fireEvent.click(saveBtn);

    await waitFor(() => expect(handlers.onSaveCurrentAs).toHaveBeenCalledTimes(1));
    expect(handlers.onSaveCurrentAs).toHaveBeenCalledWith('My recipe', 'My description', 'reword');
  });

  it('[Paste shared] decodes input and onImport receives encoded string after confirm', async () => {
    const handlers = noopHandlers();
    const recipe = userRecipe({ id: 'shared-recipe', label: 'Shared one' });
    const encoded = serialiseRecipe(recipe);
    const { container } = render(RecipesGallery, {
      props: { userRecipes: [], ...handlers },
    });

    const pasteBtn = must(
      container.querySelector<HTMLButtonElement>('[data-ega-recipe-paste]'),
      'paste button',
    );
    await fireEvent.click(pasteBtn);

    const pasteInput = must(
      container.querySelector<HTMLTextAreaElement>('[data-ega-recipe-paste-input]'),
      'paste input',
    );
    await fireEvent.input(pasteInput, { target: { value: encoded } });

    const decodeBtn = must(
      container.querySelector<HTMLButtonElement>('[data-ega-recipe-paste-decode]'),
      'decode button',
    );
    await fireEvent.click(decodeBtn);

    const preview = container.querySelector('[data-ega-recipe-paste-preview]');
    expect(preview?.textContent).toContain('Shared one');

    const applyBtn = must(
      container.querySelector<HTMLButtonElement>('[data-ega-recipe-paste-apply]'),
      'paste apply button',
    );
    await fireEvent.click(applyBtn);

    await waitFor(() => expect(handlers.onImport).toHaveBeenCalledWith(encoded));
  });

  describe('Undo after Apply', () => {
    async function applyFirstRecipe(handlers: ReturnType<typeof noopHandlers>): Promise<void> {
      const { container } = render(RecipesGallery, {
        props: {
          userRecipes: [],
          ...handlers,
          onUndoApply: vi.fn(),
        },
      });
      const firstCard = must(
        container.querySelector<HTMLElement>('[data-ega-recipe-card]'),
        'first recipe card',
      );
      await fireEvent.click(
        must(firstCard.querySelector<HTMLButtonElement>('[data-ega-recipe-apply]'), 'apply button'),
      );
      await fireEvent.click(
        must(
          Array.from(document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')).find(
            (b) => b.textContent.trim() === 'Apply',
          ),
          'dialog apply button',
        ),
      );
    }

    it('a successful apply offers Undo', async () => {
      const pushed: ToastMsg[] = [];
      const push = vi.spyOn(toastStore, 'push').mockImplementation((m) => {
        pushed.push(m);
      });
      await applyFirstRecipe(noopHandlers());
      await waitFor(() => expect(pushed).toHaveLength(1));
      expect(pushed[0]?.variant).toBe('success');
      expect(pushed[0]?.action?.label).toBe('Undo');
      push.mockRestore();
    });

    it('an apply that did not land adds no toast of its own', async () => {
      const pushed: ToastMsg[] = [];
      const push = vi.spyOn(toastStore, 'push').mockImplementation((m) => {
        pushed.push(m);
      });
      const handlers = noopHandlers();
      handlers.onApplyFull.mockRejectedValue(new Error('recipe was not applied'));
      await applyFirstRecipe(handlers);
      await waitFor(() => expect(handlers.onApplyFull).toHaveBeenCalledTimes(1));
      expect(pushed).toHaveLength(0);
      push.mockRestore();
    });
  });
});
