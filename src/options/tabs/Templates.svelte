<script lang="ts">
  import { debugCatch } from '@/shared/logger';
  import { asLangIdUnsafe, asLangPresetIdUnsafe } from '@/shared/brands';
  import { untrack } from 'svelte';
  import { SvelteMap } from 'svelte/reactivity';
  import { DEFAULT_TEMPLATE, buildPrompt, composeSystemPrefix } from '@/shared/prompts';
  import { filterGlossaryForRequest, renderGlossaryBlock } from '@/shared/glossary';
  import { filterRulesForRequest, renderRulesBlock } from '@/shared/rules';
  import { getPreset } from '@/shared/presets';
  import { CURRENT_TEMPLATE_VERSION } from '@/shared/settings-schema';
  import { confirmDialog } from '@/shared/components/confirmDialog';
  import { toastStore } from '@/shared/components/toastStore';
  import LoadingState from '@/shared/components/LoadingState.svelte';
  import Dialog from '@/shared/ui/Dialog.svelte';
  import Button from '@/shared/ui/Button.svelte';
  import TabHeader from '@/shared/components/TabHeader.svelte';
  import TemplateDiffModal from '@/options/components/TemplateDiffModal.svelte';
  import AdvancedTemplatesPane, {
    type WorkbenchChip,
  } from '@/options/components/AdvancedTemplatesPane.svelte';
  import type TemplateEditorComp from '@/options/components/TemplateEditor.svelte';
  import type RulesEditorComp from '@/options/components/RulesEditor.svelte';
  import type RecipesGalleryComp from '@/options/components/RecipesGallery.svelte';
  import type { Settings } from '@/shared/types';
  import { getRegisteredBackendIds } from '@/shared/backends/registry';
  import { createTemplatesHandlers, type RecipeApplySnapshot } from '@/options/templates-handlers';
  import type { Recipe } from '@/shared/recipes';

  interface Props {
    s: Settings | null;
    onSetSettings: (next: Settings) => void;
  }

  const { s, onSetSettings }: Props = $props();

  let activeChip: WorkbenchChip = $state('global');
  let previewOpen = $state(false);
  let previewSys = $state('');
  let previewUsr = $state('');
  let diffOpen = $state(false);

  // Lazy-load chip-body components, mirroring Advanced.svelte so the
  // initial Templates payload stays small.
  let _TemplateEditor = $state<typeof TemplateEditorComp | null>(null);
  let _RulesEditor = $state<typeof RulesEditorComp | null>(null);
  let _RecipesGallery = $state<typeof RecipesGalleryComp | null>(null);

  const BACKEND_IDS = getRegisteredBackendIds();

  function loadLazy<T>(
    moduleId: string,
    importer: () => Promise<{ default: T }>,
    setter: (m: T) => void,
  ): void {
    importer()
      .then((m) => setter(m.default))
      .catch((e: unknown) => {
        debugCatch(e, `options.Templates.lazy.${moduleId}`);
      });
  }

  $effect(() => {
    const chip = activeChip;
    untrack(() => {
      if (!_TemplateEditor) {
        loadLazy(
          'TemplateEditor',
          () => import('@/options/components/TemplateEditor.svelte'),
          (m) => (_TemplateEditor = m),
        );
      }
      if (chip === 'rules' && !_RulesEditor) {
        loadLazy(
          'RulesEditor',
          () => import('@/options/components/RulesEditor.svelte'),
          (m) => (_RulesEditor = m),
        );
      }
      if (chip === 'recipes' && !_RecipesGallery) {
        loadLazy(
          'RecipesGallery',
          () => import('@/options/components/RecipesGallery.svelte'),
          (m) => (_RecipesGallery = m),
        );
      }
    });
  });

  const handlers = createTemplatesHandlers({
    getSettings: () => s,
    setSettings: (next) => onSetSettings(next),
  });

  // One pre-apply snapshot per recipe: Undo on A's toast after applying B must not take B with it.
  const recipeSnaps = new SvelteMap<string, RecipeApplySnapshot>();

  async function applyRecipeFull(recipe: Recipe): Promise<void> {
    const snap = await handlers.applyRecipeFull(recipe);
    // A re-apply snapshots the recipe's own values, so only the first snapshot holds the pre-recipe ones.
    const prev = recipeSnaps.get(recipe.id);
    recipeSnaps.set(
      recipe.id,
      prev ? { ...prev, addedRuleIds: [...prev.addedRuleIds, ...snap.addedRuleIds] } : snap,
    );
  }

  async function undoRecipeApply(recipe: Recipe): Promise<void> {
    const snap = recipeSnaps.get(recipe.id);
    if (!snap) return;
    // The snapshot is the only way back, so it is dropped after the restore lands, never before.
    if (await handlers.undoRecipeApply(snap)) {
      recipeSnaps.delete(recipe.id);
      return;
    }
    toastStore.push({
      message: `"${recipe.label}" is still applied.`,
      variant: 'warning',
      action: { label: 'Undo', onClick: () => void undoRecipeApply(recipe) },
    });
  }

  const PREVIEW_TEXT = 'mar7aba, kifak?';

  function openPreview(): void {
    if (!s) return;
    const preset = getPreset('arabizi');
    const built = buildPrompt(
      {
        id: 'preview',
        text: PREVIEW_TEXT,
        sourceLang: asLangPresetIdUnsafe('arabizi'),
        targetLang: asLangIdUnsafe('en'),
        options: { stream: false, explain: false },
      },
      {
        preset,
        template: { ...s.advanced.promptTemplate },
      },
    );
    const glossaryBlock = renderGlossaryBlock(
      filterGlossaryForRequest(s.glossary, {
        text: PREVIEW_TEXT,
        sourceLang: 'arabizi',
        targetLang: 'en',
      }),
    );
    const rulesBlock = renderRulesBlock(
      filterRulesForRequest(s.advanced.rules, 'translate', undefined),
    );
    previewSys = composeSystemPrefix(glossaryBlock, rulesBlock, built.system);
    previewUsr = built.user;
    previewOpen = true;
  }
  function closePreview(): void {
    previewOpen = false;
  }

  async function onKeepMine(): Promise<void> {
    await handlers.patchAdvanced({ templateVersionAcknowledged: CURRENT_TEMPLATE_VERSION });
  }
  function onShowDiff(): void {
    diffOpen = true;
  }
  async function onOverwrite(): Promise<void> {
    const confirmed = await confirmDialog({
      title: 'Overwrite prompt template?',
      body: 'This replaces your prompt template with the new default. This cannot be undone.',
      confirmLabel: 'Overwrite',
      danger: true,
    });
    if (!confirmed) return;
    await handlers.patchAdvanced({
      promptTemplate: { ...DEFAULT_TEMPLATE },
      templateVersion: CURRENT_TEMPLATE_VERSION,
      templateVersionAcknowledged: CURRENT_TEMPLATE_VERSION,
    });
  }
</script>

<section data-ega-tab="templates" class="templates-root">
  <TabHeader tab="templates" />
  {#if !s}
    <LoadingState rows={6} label="Loading templates…" />
  {:else}
    <AdvancedTemplatesPane
      {s}
      chip={activeChip}
      backendIds={BACKEND_IDS}
      TemplateEditorCmp={_TemplateEditor}
      RulesEditorCmp={_RulesEditor}
      RecipesGalleryCmp={_RecipesGallery}
      {handlers}
      onChipChange={(c) => (activeChip = c)}
      onOpenPreview={openPreview}
      {onKeepMine}
      {onShowDiff}
      {onOverwrite}
      onApplyRecipeFull={applyRecipeFull}
      onUndoRecipeApply={undoRecipeApply}
    />
  {/if}
</section>

<Dialog open={previewOpen} title="Compiled prompt — sample input" onClose={closePreview} size="lg">
  {#snippet help()}
    Sample input: <code>"mar7aba, kifak?"</code> as Arabizi → English, with the rules and glossary entries
    this sample matches. A real request also carries the page context, and any refinement you type at
    the time.
  {/snippet}
  {#snippet actions()}
    <Button variant="secondary" onclick={closePreview}>Close</Button>
  {/snippet}

  <div data-ega-preview-modal>
    <h4>System</h4>
    <pre class="preview-block">{previewSys}</pre>
    <h4>User</h4>
    <pre class="preview-block">{previewUsr}</pre>
  </div>
</Dialog>

{#if diffOpen && s}
  <TemplateDiffModal
    userTemplate={s.advanced.promptTemplate}
    currentTemplate={DEFAULT_TEMPLATE}
    onClose={() => (diffOpen = false)}
  />
{/if}

<style>
  .templates-root {
    display: flex;
    flex-direction: column;
    gap: var(--card-gap);
  }
  h4 {
    margin: var(--space-2) 0 var(--space-1);
    font-size: var(--fs-sm);
    color: var(--color-muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .preview-block {
    background: var(--color-bg-sunken);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-md);
    padding: var(--space-2);
    font-family: var(--font-mono);
    font-size: var(--fs-sm);
    line-height: 1.45;
    white-space: pre-wrap;
    word-break: break-word;
    max-height: 32vh;
    overflow: auto;
    margin: 0;
    color: var(--color-fg);
  }
</style>
