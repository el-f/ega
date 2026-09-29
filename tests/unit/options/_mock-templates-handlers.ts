import { vi } from 'vitest';
import type { TemplatesHandlers } from '@/options/templates-handlers';

/** Full TemplatesHandlers shape with every method a resolved vi.fn(). */
export function makeMockHandlers(overrides: Partial<TemplatesHandlers> = {}): TemplatesHandlers {
  const resolved = () => vi.fn().mockResolvedValue(undefined);
  const handlers: TemplatesHandlers = {
    patchAdvanced: resolved(),
    saveGlobalTemplate: resolved(),
    resetGlobalTemplate: resolved(),
    setGlobalTemperature: resolved(),
    setGlobalMaxTokens: resolved(),
    setGlobalReasoningEffort: resolved(),
    setTaskTemplate: resolved(),
    setTaskBackend: resolved(),
    setTaskTemperature: resolved(),
    setTaskMaxTokens: resolved(),
    setTaskReasoningEffort: resolved(),
    setTaskTone: resolved(),
    updateRules: resolved(),
    appendHeaderRule: resolved(),
    setSnippets: resolved(),
    savePerPreset: resolved(),
    clearPerPreset: resolved(),
    setCustomSlotDescription: resolved(),
    applyRecipeFull: vi.fn().mockResolvedValue({
      recipeId: 'r',
      task: 'translate',
      addedRuleIds: [],
      template: undefined,
      tone: undefined,
      temperature: undefined,
      maxTokens: undefined,
    }),
    undoRecipeApply: vi.fn().mockResolvedValue(true),
    applyRecipeRulesOnly: resolved(),
    saveRecipeFromCurrent: resolved(),
    deleteUserRecipe: resolved(),
    importRecipe: resolved(),
  };
  return { ...handlers, ...overrides };
}
