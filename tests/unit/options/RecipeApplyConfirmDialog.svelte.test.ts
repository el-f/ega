// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import RecipeApplyConfirmDialog from '@/options/components/recipes/RecipeApplyConfirmDialog.svelte';
import type { Recipe } from '@/shared/recipes';

function recipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    id: 'r-test',
    task: 'summarize',
    label: 'Quick tldr',
    description: 'Short summary.',
    ...overrides,
  };
}

describe('RecipeApplyConfirmDialog — params line', () => {
  it('states the concrete values, not just the param names', () => {
    const { container } = render(RecipeApplyConfirmDialog, {
      props: {
        recipe: recipe({ generationParams: { maxTokens: 200 } }),
        onCancel: vi.fn(),
        onConfirm: vi.fn(),
      },
    });
    expect(container.textContent).toContain('Set max tokens to 200.');
  });

  it('joins multiple params with their values and human tone label', () => {
    const { container } = render(RecipeApplyConfirmDialog, {
      props: {
        recipe: recipe({ generationParams: { temperature: 0.3, tone: 'formal' } }),
        onCancel: vi.fn(),
        onConfirm: vi.fn(),
      },
    });
    expect(container.textContent).toContain('Set temperature to 0.3, tone to Formal.');
  });

  it('renders no params row when the recipe sets none', () => {
    const { container } = render(RecipeApplyConfirmDialog, {
      props: { recipe: recipe(), onCancel: vi.fn(), onConfirm: vi.fn() },
    });
    expect(container.textContent).not.toContain('Set ');
  });
});
