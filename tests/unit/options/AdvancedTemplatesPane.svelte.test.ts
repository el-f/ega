// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/svelte';
import AdvancedTemplatesPane from '@/options/components/AdvancedTemplatesPane.svelte';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { CURRENT_TEMPLATE_VERSION, parseStoredSettings } from '@/shared/settings-schema';
import type { Task } from '@/shared/task-prompts';
import { makeMockHandlers } from './_mock-templates-handlers';
import { V8_PROMPT_TEMPLATE } from '../shared/_v8-prompt-template';

// Mirrors the module-script export in AdvancedTemplatesPane.svelte — plain tsc can't resolve it.
type WorkbenchChip = 'global' | Task | 'rules' | 'recipes' | 'per-preset' | 'snippets';

const baseProps = (overrides: { chip?: WorkbenchChip; [key: string]: unknown } = {}) => {
  const { chip, ...rest } = overrides;
  return {
    s: DEFAULT_SETTINGS,
    chip: (chip ?? 'global') as WorkbenchChip,
    backendIds: [] as readonly string[],
    TemplateEditorCmp: null,
    RulesEditorCmp: null,
    RecipesGalleryCmp: null,
    handlers: makeMockHandlers(),
    onChipChange: vi.fn(),
    onOpenPreview: vi.fn(),
    onKeepMine: vi.fn().mockResolvedValue(undefined),
    onShowDiff: vi.fn(),
    onOverwrite: vi.fn().mockResolvedValue(undefined),
    onApplyRecipeFull: vi.fn().mockResolvedValue(undefined),
    onUndoRecipeApply: vi.fn().mockResolvedValue(undefined),
    ...rest,
  };
};

describe('AdvancedTemplatesPane', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('mounts and renders the chip strip', () => {
    const { container } = render(AdvancedTemplatesPane, {
      props: baseProps(),
    });
    expect(container.querySelector('[data-ega-prompt-workbench]')).not.toBeNull();
    expect(container.querySelector('[data-ega-workbench-chip="global"]')).not.toBeNull();
    expect(container.querySelector('[data-ega-workbench-chip="rules"]')).not.toBeNull();
  });

  it('folds the customized state into the chip aria-label', () => {
    const customised = {
      ...DEFAULT_SETTINGS,
      advanced: {
        ...DEFAULT_SETTINGS.advanced,
        promptTemplate: { system: 'CUSTOM SENTINEL SYSTEM', user: 'CUSTOM SENTINEL USER' },
      },
    };
    const { container } = render(AdvancedTemplatesPane, {
      props: baseProps({ s: customised }),
    });
    const globalChip = container.querySelector('[data-ega-workbench-chip="global"]');
    expect(globalChip?.getAttribute('aria-label')).toBe('Global — Scope, customized');
    // The decorative dot must not carry its own accessible name.
    const dot = globalChip?.querySelector('.custom-dot');
    expect(dot?.getAttribute('aria-hidden')).toBe('true');
    expect(dot?.hasAttribute('aria-label')).toBe(false);
  });

  it('omits ", customized" for a chip with no override', () => {
    const { container } = render(AdvancedTemplatesPane, {
      props: baseProps(),
    });
    // Snippets is empty in DEFAULT_SETTINGS → not customized.
    const snippetsChip = container.querySelector('[data-ega-workbench-chip="snippets"]');
    expect(snippetsChip?.getAttribute('aria-label')).toBe('Snippets — Overrides');
  });

  it('jumping from a task chip to per-preset via the rail surfaces the source-task hint', async () => {
    // Mount on reword so CascadeRail offers the per-preset jump.
    let chip: WorkbenchChip = 'reword';
    const onChipChange = (c: WorkbenchChip) => {
      chip = c;
    };
    const { container, rerender } = render(AdvancedTemplatesPane, {
      props: { ...baseProps({ chip }), onChipChange },
    });
    const perPreset = container.querySelector(
      '[data-ega-cascade-layer="per-preset"]',
    ) as HTMLButtonElement;
    await fireEvent.click(perPreset);
    expect(chip).toBe('per-preset');
    // Parent flipped its chip — rerender mirrors that flow.
    await rerender({ ...baseProps({ chip }), onChipChange });
    expect(container.querySelector('[data-ega-source-task-hint="reword"]')).not.toBeNull();
  });

  it('source-task hint clears when the user picks a chip directly from the strip', async () => {
    let chip: WorkbenchChip = 'reword';
    const onChipChange = (c: WorkbenchChip) => {
      chip = c;
    };
    const { container, rerender } = render(AdvancedTemplatesPane, {
      props: { ...baseProps({ chip }), onChipChange },
    });
    const perPreset = container.querySelector(
      '[data-ega-cascade-layer="per-preset"]',
    ) as HTMLButtonElement;
    await fireEvent.click(perPreset);
    await rerender({ ...baseProps({ chip }), onChipChange });
    expect(container.querySelector('[data-ega-source-task-hint]')).not.toBeNull();
    // User clicks the per-preset chip directly — hint should clear.
    const chipBtn = container.querySelector(
      '[data-ega-workbench-chip="per-preset"]',
    ) as HTMLButtonElement;
    await fireEvent.click(chipBtn);
    await rerender({ ...baseProps({ chip }), onChipChange });
    expect(container.querySelector('[data-ega-source-task-hint]')).toBeNull();
  });

  it('arrow-keying to the per-preset chip clears a stale source-task hint', async () => {
    let chip: WorkbenchChip = 'reword';
    const onChipChange = (c: WorkbenchChip) => {
      chip = c;
    };
    const { container, rerender } = render(AdvancedTemplatesPane, {
      props: { ...baseProps({ chip }), onChipChange },
    });
    // Seed the hint by jumping via the CascadeRail (sets sourceTaskHint).
    const perPreset = container.querySelector(
      '[data-ega-cascade-layer="per-preset"]',
    ) as HTMLButtonElement;
    await fireEvent.click(perPreset);
    await rerender({ ...baseProps({ chip }), onChipChange });
    expect(container.querySelector('[data-ega-source-task-hint]')).not.toBeNull();

    // Arrow-key off per-preset onto the next chip — handleChipKey now routes
    // through handleChipChange, which clears the hint.
    const perPresetChip = container.querySelector(
      '[data-ega-workbench-chip="per-preset"]',
    ) as HTMLButtonElement;
    await fireEvent.keyDown(perPresetChip, { key: 'ArrowRight' });
    await rerender({ ...baseProps({ chip }), onChipChange });
    expect(container.querySelector('[data-ega-source-task-hint]')).toBeNull();
  });

  it('arrow-key on a chip moves selection AND DOM focus to the new tab', async () => {
    let chip: WorkbenchChip = 'global';
    const onChipChange = (c: WorkbenchChip) => {
      chip = c;
    };
    const { container, rerender } = render(AdvancedTemplatesPane, {
      props: { ...baseProps({ chip }), onChipChange },
    });
    const globalChip = container.querySelector('#adv-chip-global') as HTMLButtonElement;
    globalChip.focus();
    await fireEvent.keyDown(globalChip, { key: 'ArrowRight' });
    await rerender({ ...baseProps({ chip }), onChipChange });
    // CHIPS[1] is the first task. Focus must have moved off global onto it.
    expect(chip).not.toBe('global');
    expect(document.activeElement).toBe(container.querySelector(`#adv-chip-${chip}`));
  });

  it('clicking a chip invokes onChipChange with that chip id', async () => {
    const onChipChange = vi.fn();
    const { container } = render(AdvancedTemplatesPane, {
      props: baseProps({ chip: 'global', onChipChange }),
    });

    const rulesChip = container.querySelector(
      '[data-ega-workbench-chip="rules"]',
    ) as HTMLButtonElement;
    expect(rulesChip).not.toBeNull();
    await fireEvent.click(rulesChip);

    expect(onChipChange).toHaveBeenCalledWith('rules');
  });

  it('clicking a task chip invokes onChipChange with the task id', async () => {
    const onChipChange = vi.fn();
    const { container } = render(AdvancedTemplatesPane, {
      props: baseProps({ chip: 'global', onChipChange }),
    });

    const rewordChip = container.querySelector(
      '[data-ega-workbench-chip="reword"]',
    ) as HTMLButtonElement;
    expect(rewordChip).not.toBeNull();
    await fireEvent.click(rewordChip);

    expect(onChipChange).toHaveBeenCalledWith('reword');
  });

  it('temperature input on a task chip delegates to handlers.setTaskTemperature with (task, value)', async () => {
    const handlers = makeMockHandlers();
    const { container } = render(AdvancedTemplatesPane, {
      props: baseProps({ chip: 'reword', handlers }),
    });

    const tempInput = container.querySelector('[data-ega-task-temp="reword"]') as HTMLInputElement;
    expect(tempInput).not.toBeNull();
    await fireEvent.input(tempInput, { target: { value: '0.5' } });

    await waitFor(() => expect(handlers.setTaskTemperature).toHaveBeenCalled());
    expect(handlers.setTaskTemperature).toHaveBeenCalledWith('reword', 0.5);
  });

  it('handlers.setTaskBackend is invoked with (task, backendId) when backend select changes', async () => {
    const handlers = makeMockHandlers();
    const { container } = render(AdvancedTemplatesPane, {
      props: baseProps({ chip: 'reword', handlers, backendIds: ['anthropic'] }),
    });

    const backendSelect = container.querySelector(
      '[data-ega-task-backend="reword"]',
    ) as HTMLSelectElement;
    expect(backendSelect).not.toBeNull();
    await fireEvent.change(backendSelect, { target: { value: 'anthropic' } });

    await waitFor(() => expect(handlers.setTaskBackend).toHaveBeenCalled());
    expect(handlers.setTaskBackend).toHaveBeenCalledWith('reword', 'anthropic');
  });

  it('TemplateVersionBanner renders only when chip=global and template version drift', () => {
    const driftSettings = {
      ...DEFAULT_SETTINGS,
      advanced: {
        ...DEFAULT_SETTINGS.advanced,
        promptTemplate: { system: 'CUSTOM SENTINEL SYSTEM', user: 'CUSTOM SENTINEL USER' },
        templateVersion: Math.max(0, CURRENT_TEMPLATE_VERSION - 1),
        templateVersionAcknowledged: undefined,
      },
    } as typeof DEFAULT_SETTINGS;

    const globalRender = render(AdvancedTemplatesPane, {
      props: { ...baseProps({ chip: 'global' }), s: driftSettings },
    });
    expect(globalRender.container.querySelector('[data-ega-tpl-version-banner]')).not.toBeNull();
    globalRender.unmount();

    const rulesRender = render(AdvancedTemplatesPane, {
      props: { ...baseProps({ chip: 'rules' }), s: driftSettings },
    });
    expect(rulesRender.container.querySelector('[data-ega-tpl-version-banner]')).toBeNull();
    rulesRender.unmount();
  });

  it('a stored translate/explain task template does not mark those chips customized', () => {
    const tpl = { system: 'IGNORED SYSTEM', user: 'IGNORED USER {{text}}' };
    const withDeadTemplates = {
      ...DEFAULT_SETTINGS,
      advanced: {
        ...DEFAULT_SETTINGS.advanced,
        taskTemplates: { translate: tpl, explain: tpl, summarize: tpl },
      },
    } as typeof DEFAULT_SETTINGS;

    const { container } = render(AdvancedTemplatesPane, {
      props: { ...baseProps({ chip: 'global' }), s: withDeadTemplates },
    });
    for (const dead of ['translate', 'explain']) {
      const chip = container.querySelector(`[data-ega-workbench-chip="${dead}"]`);
      expect(chip?.getAttribute('aria-label')).not.toContain('customized');
    }
    const live = container.querySelector('[data-ega-workbench-chip="summarize"]');
    expect(live?.getAttribute('aria-label')).toContain('customized');
  });

  it('the rules-budget warning counts site-scoped rules', () => {
    const siteRules = Array.from({ length: 30 }, (_, i) => ({
      id: `r${i}`,
      body: 'x'.repeat(400),
      category: 'always' as const,
      scope: { tasks: [], sites: ['example.com'] },
      source: 'manual' as const,
      addedAt: '2026-08-15T00:00:00.000Z',
      enabled: true,
    }));
    const withSiteRules = {
      ...DEFAULT_SETTINGS,
      advanced: { ...DEFAULT_SETTINGS.advanced, rules: siteRules },
    } as typeof DEFAULT_SETTINGS;

    const { container } = render(AdvancedTemplatesPane, {
      props: { ...baseProps({ chip: 'rules' }), s: withSiteRules },
    });
    expect(container.querySelector('[data-ega-rules-budget-warn]')).not.toBeNull();
  });

  it('a profile still on the shipped template gets no overwrite banner on version drift', () => {
    const untouched = {
      ...DEFAULT_SETTINGS,
      advanced: {
        ...DEFAULT_SETTINGS.advanced,
        templateVersion: Math.max(0, CURRENT_TEMPLATE_VERSION - 1),
        templateVersionAcknowledged: undefined,
      },
    } as typeof DEFAULT_SETTINGS;

    const { container } = render(AdvancedTemplatesPane, {
      props: { ...baseProps({ chip: 'global' }), s: untouched },
    });
    expect(container.querySelector('[data-ega-tpl-version-banner]')).toBeNull();
  });

  it('a stored row still holding the PREVIOUS shipped template gets no overwrite banner', () => {
    // A plain text-vs-current-default compare reads this row as "customized".
    const stored = parseStoredSettings(
      {
        ...DEFAULT_SETTINGS,
        advanced: {
          ...DEFAULT_SETTINGS.advanced,
          promptTemplate: V8_PROMPT_TEMPLATE,
          templateVersion: CURRENT_TEMPLATE_VERSION - 1,
        },
      },
      { defaults: DEFAULT_SETTINGS },
    ) as typeof DEFAULT_SETTINGS;

    const { container } = render(AdvancedTemplatesPane, {
      props: { ...baseProps({ chip: 'global' }), s: stored },
    });
    expect(container.querySelector('[data-ega-tpl-version-banner]')).toBeNull();
    expect(
      container.querySelector('[data-ega-workbench-chip="global"]')?.getAttribute('aria-label'),
    ).not.toContain('customized');
  });
});
