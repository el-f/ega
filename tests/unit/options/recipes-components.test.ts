// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import RecipeCard from '@/options/components/recipes/RecipeCard.svelte';
import RecipeApplyConfirmDialog from '@/options/components/recipes/RecipeApplyConfirmDialog.svelte';
import RecipeNewDialog from '@/options/components/recipes/RecipeNewDialog.svelte';
import RecipePasteDialog from '@/options/components/recipes/RecipePasteDialog.svelte';
import type { Recipe } from '@/shared/recipes';

const userRecipe: Recipe = {
  id: 'user-keep-emoji',
  task: 'translate',
  label: 'Keep emoji exactly',
  description: 'Preserve emoji from source verbatim.',
  // Two rules so the "Add rules" affordance renders. Single-rule recipes
  // omit it — the primary "Apply" button handles them.
  rules: [
    { body: 'Always preserve emoji verbatim.', category: 'always' },
    { body: 'Never strip skin-tone modifiers.', category: 'never' },
  ],
};

const singleRuleRecipe: Recipe = {
  id: 'user-single',
  task: 'translate',
  label: 'Single rule',
  description: '',
  rules: [{ body: 'Only rule.', category: 'always' }],
};

describe('RecipeCard', () => {
  it('renders bundled card without export/delete affordances', () => {
    const { container } = render(RecipeCard, {
      props: {
        recipe: userRecipe,
        isUser: false,
        onApply: () => {},
        onApplyRulesOnly: () => {},
      },
    });
    expect(container.querySelector('[data-ega-recipe-card]')).not.toBeNull();
    expect(container.querySelector('[data-ega-recipe-apply]')).not.toBeNull();
    expect(container.querySelector('[data-ega-recipe-rules-only]')).not.toBeNull();
    expect(container.querySelector('[data-ega-recipe-export]')).toBeNull();
    expect(container.querySelector('[data-ega-recipe-delete]')).toBeNull();
  });

  it('apply-rules-only button has tooltip clarifying generation params unchanged', () => {
    const { container } = render(RecipeCard, {
      props: {
        recipe: userRecipe,
        isUser: false,
        onApply: () => {},
        onApplyRulesOnly: () => {},
      },
    });
    const btn = container.querySelector('[data-ega-recipe-rules-only]');
    expect(btn).not.toBeNull();
    expect(btn?.getAttribute('title')).toContain('Template, temperature and tone stay as they are');
  });

  it('single-rule recipe omits the rules-only button and labels Apply (not Apply all)', () => {
    const { container } = render(RecipeCard, {
      props: {
        recipe: singleRuleRecipe,
        isUser: false,
        onApply: () => {},
        onApplyRulesOnly: () => {},
      },
    });
    const apply = container.querySelector('[data-ega-recipe-apply]');
    expect(apply).not.toBeNull();
    expect(apply?.textContent.trim()).toBe('Apply');
    expect(container.querySelector('[data-ega-recipe-rules-only]')).toBeNull();
  });

  it('multi-rule recipe labels primary button "Apply all" and renders rules-only', () => {
    const { container } = render(RecipeCard, {
      props: {
        recipe: userRecipe,
        isUser: false,
        onApply: () => {},
        onApplyRulesOnly: () => {},
      },
    });
    const apply = container.querySelector('[data-ega-recipe-apply]');
    expect(apply).not.toBeNull();
    expect(apply?.textContent.trim()).toBe('Apply all');
    expect(container.querySelector('[data-ega-recipe-rules-only]')).not.toBeNull();
  });

  it('renders user card with export + delete affordances', () => {
    const { container } = render(RecipeCard, {
      props: {
        recipe: userRecipe,
        isUser: true,
        onApply: () => {},
        onApplyRulesOnly: () => {},
        onExport: () => {},
        onDelete: () => {},
      },
    });
    expect(container.querySelector('[data-ega-recipe-export]')).not.toBeNull();
    expect(container.querySelector('[data-ega-recipe-delete]')).not.toBeNull();
  });
});

describe('RecipeApplyConfirmDialog', () => {
  it('mounts as a dialog with Apply button + structured diff', () => {
    render(RecipeApplyConfirmDialog, {
      props: {
        recipe: userRecipe,
        onCancel: () => {},
        onConfirm: () => {},
      },
    });
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    const applyBtn = Array.from(
      document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button'),
    ).find((b) => b.textContent.trim() === 'Apply');
    expect(applyBtn).toBeDefined();
  });
});

describe('RecipeNewDialog', () => {
  it('mounts with label / desc / task fields + save button', () => {
    const { container } = render(RecipeNewDialog, {
      props: {
        onClose: () => {},
        onSubmit: vi.fn(async () => {}),
        onSuccess: () => {},
      },
    });
    // Inputs render in the dialog portal — search document root, not container.
    expect(document.querySelector('[data-ega-recipe-new-label]')).not.toBeNull();
    expect(document.querySelector('[data-ega-recipe-new-desc]')).not.toBeNull();
    expect(document.querySelector('[data-ega-recipe-new-task]')).not.toBeNull();
    expect(document.querySelector('[data-ega-recipe-new-save]')).not.toBeNull();
    // Container itself is empty (dialog portals to body); presence-of-portal is the contract.
    expect(container).toBeTruthy();
  });
});

describe('RecipePasteDialog', () => {
  it('mounts with paste input + decode button (no preview yet)', () => {
    render(RecipePasteDialog, {
      props: {
        onClose: () => {},
        onImport: vi.fn(async () => {}),
        onSuccess: () => {},
        onFailure: () => {},
      },
    });
    expect(document.querySelector('[data-ega-recipe-paste-input]')).not.toBeNull();
    expect(document.querySelector('[data-ega-recipe-paste-decode]')).not.toBeNull();
    expect(document.querySelector('[data-ega-recipe-paste-preview]')).toBeNull();
    expect(document.querySelector('[data-ega-recipe-paste-apply]')).toBeNull();
  });
});
