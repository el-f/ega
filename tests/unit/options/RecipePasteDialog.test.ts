// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/svelte';
import RecipePasteDialog from '@/options/components/recipes/RecipePasteDialog.svelte';
import { serialiseRecipe, type Recipe } from '@/shared/recipes';

vi.mock('@/shared/components/confirmDialog', () => ({
  confirmDialog: vi.fn(async () => true),
}));

const recipe: Recipe = {
  id: 'reviewed-recipe',
  task: 'translate',
  label: 'Reviewed recipe',
  description: 'A recipe that must be previewed before import.',
  rules: [],
};

describe('RecipePasteDialog', () => {
  it('requires another preview after the pasted code changes', async () => {
    const onImport = vi.fn(async () => {});
    render(RecipePasteDialog, {
      props: {
        onClose: vi.fn(),
        onImport,
        onSuccess: vi.fn(),
        onFailure: vi.fn(),
      },
    });

    const input = document.querySelector('[data-ega-recipe-paste-input]') as HTMLTextAreaElement;
    const preview = document.querySelector('[data-ega-recipe-paste-decode]') as HTMLButtonElement;
    expect(input).not.toBeNull();
    expect(preview).not.toBeNull();

    await fireEvent.input(input, { target: { value: serialiseRecipe(recipe) } });
    await fireEvent.click(preview);
    expect(document.querySelector('[data-ega-recipe-paste-apply]')).not.toBeNull();

    await fireEvent.input(input, { target: { value: 'not-the-reviewed-code' } });

    expect(document.querySelector('[data-ega-recipe-paste-preview]')).toBeNull();
    expect(document.querySelector('[data-ega-recipe-paste-apply]')).toBeNull();
    expect(document.querySelector('[data-ega-recipe-paste-decode]')).not.toBeNull();
    expect(onImport).not.toHaveBeenCalled();
  });
});
