import {
  updateSettings,
  replaceSettings,
  replaceRules,
  replaceSnippets,
  replacePerPresetTemplates,
  replaceTaskBackends,
  replaceTaskTemperatures,
  replaceTaskMaxTokens,
  replaceTaskReasoningEfforts,
  replaceTaskTemplates,
  replaceTaskTones,
  replaceUserRecipes,
} from '@/shared/storage';
import { DEFAULT_TEMPLATE } from '@/shared/prompts';
import { deserialiseRecipe, type Recipe } from '@/shared/recipes';
import type { Rule } from '@/shared/rules';
import { uuid } from '@/shared/uuid';
import {
  CUSTOM_SLOTS_MAX,
  RULES_MAX,
  SLOT_DESCRIPTION_MAX,
  SLOT_NAME_MAX,
  USER_RECIPES_MAX,
} from '@/shared/settings-schema';
import { toastStore } from '@/shared/components/toastStore';
import { saveVia } from './storage-with-toast';
import type { Settings, PromptTemplate, BackendId } from '@/shared/types';
import type { Task, Tone } from '@/shared/task-prompts';

type ReasoningEffort = Settings['advanced']['reasoningEffort'];

export interface TemplatesHandlerCtx {
  /** The tab's settings, read only for guards and caps; every write reads the stored row under the lock. */
  getSettings: () => Settings | null;
  setSettings: (next: Settings) => void;
}

/** What `applyRecipeFull` changed for its task, so undo touches that task and this recipe's rules only. */
export interface RecipeApplySnapshot {
  recipeId: string;
  task: Task;
  /** Ids of the rules this apply added; an earlier apply's rules and the user's edits stay on undo. */
  addedRuleIds: readonly string[];
  /** Pre-apply values for the task; undefined means the task had none. */
  template: PromptTemplate | undefined;
  tone: Tone | undefined;
  temperature: number | undefined;
  maxTokens: number | undefined;
  /** What the recipe wrote. Undo restores a field only while it still holds this value. */
  applied: {
    template?: PromptTemplate;
    tone?: Tone;
    temperature?: number;
    maxTokens?: number;
  };
}

/** Restores `pre` for `key` only while the map still holds what the recipe wrote there. */
function undoKey<V>(
  map: Partial<Record<Task, V>> | undefined,
  key: Task,
  applied: V | undefined,
  pre: V | undefined,
  same: (a: V, b: V) => boolean = (a, b) => a === b,
): Partial<Record<Task, V>> | undefined {
  const now = map?.[key];
  if (applied === undefined || now === undefined || !same(now, applied)) return map;
  return withKey(map, key, pre);
}

const sameTemplate = (a: PromptTemplate | undefined, b: PromptTemplate | undefined): boolean =>
  a?.system === b?.system && a?.user === b?.user;

/** A copy of `map` with `key` set to `value`, or removed when the value is undefined. */
function withKey<V>(
  map: Partial<Record<Task, V>> | undefined,
  key: Task,
  value: V | undefined,
): Partial<Record<Task, V>> {
  const out: Partial<Record<Task, V>> = { ...map };
  if (value === undefined) delete out[key];
  else out[key] = value;
  return out;
}

export interface TemplatesHandlers {
  patchAdvanced: (p: Partial<Settings['advanced']>) => Promise<void>;
  saveGlobalTemplate: (tpl: PromptTemplate) => Promise<void>;
  resetGlobalTemplate: () => Promise<void>;
  setGlobalTemperature: (v: number) => Promise<void>;
  setGlobalMaxTokens: (v: number) => Promise<void>;
  setGlobalReasoningEffort: (v: ReasoningEffort) => Promise<void>;
  setTaskTemplate: (task: Task, tpl: PromptTemplate | null) => Promise<void>;
  setTaskBackend: (task: Task, value: string) => Promise<void>;
  setTaskTemperature: (task: Task, v: number | null) => Promise<void>;
  setTaskMaxTokens: (task: Task, v: number | null) => Promise<void>;
  setTaskReasoningEffort: (task: Task, v: ReasoningEffort | null) => Promise<void>;
  setTaskTone: (task: Task, v: Tone | null) => Promise<void>;
  updateRules: (next: readonly Rule[]) => Promise<void>;
  appendHeaderRule: (rule: Rule) => Promise<void>;
  setSnippets: (next: Record<string, string>) => Promise<void>;
  savePerPreset: (presetId: string, tpl: PromptTemplate) => Promise<void>;
  clearPerPreset: (presetId: string) => Promise<void>;
  setCustomSlotDescription: (name: string, description: string) => Promise<void>;
  /** Returns a pre-apply snapshot. Callers pass it to `undoRecipeApply` to restore. */
  applyRecipeFull: (recipe: Recipe) => Promise<RecipeApplySnapshot>;
  /** Returns false when the restore write did not land, so the caller can keep the snapshot. */
  undoRecipeApply: (snap: RecipeApplySnapshot) => Promise<boolean>;
  applyRecipeRulesOnly: (recipe: Recipe) => Promise<void>;
  saveRecipeFromCurrent: (label: string, description: string, task: Task) => Promise<void>;
  deleteUserRecipe: (id: string) => Promise<void>;
  importRecipe: (encoded: string) => Promise<void>;
}

function newRecipeId(): string {
  return `user-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function recipeRulesToRules(recipe: Recipe): Rule[] {
  return (recipe.rules ?? []).map((r) => ({
    id: uuid(),
    body: r.body,
    category: r.category,
    scope:
      r.scopeSites && r.scopeSites.length > 0
        ? { tasks: [recipe.task], sites: [...r.scopeSites] }
        : { tasks: [recipe.task] },
    source: 'recipe',
    recipeId: recipe.id,
    addedAt: new Date().toISOString(),
    enabled: true,
  }));
}

/** Drops recipe rules that match an active rule on (recipeId, body, category); bodies are trimmed before comparing. */
function filterDupeRecipeRules(candidates: Rule[], priorRules: readonly Rule[]): Rule[] {
  const existing = new Set(
    priorRules
      .filter((r) => r.source === 'recipe' && r.recipeId !== undefined)
      .map((r) => `${r.recipeId}${r.category}${r.body.trim()}`),
  );
  return candidates.filter((c) => !existing.has(`${c.recipeId}${c.category}${c.body.trim()}`));
}

/** Throws when the list is full: the dialog shows the message, and a write past the cap would fail schema repair and reset all of `advanced`. */
function assertRecipeRoom(current: readonly Recipe[]): void {
  if (current.length < USER_RECIPES_MAX) return;
  throw new Error(`Recipe limit is ${USER_RECIPES_MAX} — delete one before saving another.`);
}

function appendWithinRulesCap(priorRules: readonly Rule[], added: readonly Rule[]): Rule[] {
  const room = Math.max(0, RULES_MAX - priorRules.length);
  const dropped = added.length - Math.min(added.length, room);
  if (dropped > 0) {
    toastStore.push({
      message: `Rule limit is ${RULES_MAX} — ${dropped} of ${added.length} recipe rules were not added.`,
      variant: 'warning',
    });
  }
  return [...priorRules, ...added.slice(0, room)];
}

export function createTemplatesHandlers(ctx: TemplatesHandlerCtx): TemplatesHandlers {
  const { getSettings, setSettings } = ctx;

  async function patchAdvanced(p: Partial<Settings['advanced']>): Promise<void> {
    // `Partial<Settings>` types `advanced` as full Settings['advanced']; updateSettings
    // deep-merges internally so a Partial<advanced> patch is valid at runtime.
    const next = await saveVia(() => updateSettings({ advanced: p as Settings['advanced'] }));
    if (next) setSettings(next);
  }

  async function saveGlobalTemplate(tpl: PromptTemplate): Promise<void> {
    await patchAdvanced({ promptTemplate: tpl });
  }

  async function resetGlobalTemplate(): Promise<void> {
    await patchAdvanced({ promptTemplate: { ...DEFAULT_TEMPLATE } });
  }

  async function setGlobalTemperature(v: number): Promise<void> {
    await patchAdvanced({ temperature: v });
  }

  async function setGlobalMaxTokens(v: number): Promise<void> {
    await patchAdvanced({ maxTokens: v });
  }

  async function setGlobalReasoningEffort(v: ReasoningEffort): Promise<void> {
    await patchAdvanced({ reasoningEffort: v });
  }

  // Each one reads the map under the lock: a snapshot taken here would drop a sibling key another write set meanwhile.
  async function setTaskTemplate(task: Task, tpl: PromptTemplate | null): Promise<void> {
    if (!getSettings()) return;
    const next = await saveVia(() =>
      replaceTaskTemplates((cur) => withKey(cur, task, tpl ?? undefined)),
    );
    if (next) setSettings(next);
  }

  async function setTaskBackend(task: Task, value: string): Promise<void> {
    if (!getSettings()) return;
    const next = await saveVia(() =>
      replaceTaskBackends((cur) =>
        withKey(cur, task, value === '' ? undefined : (value as 'auto' | BackendId)),
      ),
    );
    if (next) setSettings(next);
  }

  async function setTaskTemperature(task: Task, v: number | null): Promise<void> {
    if (!getSettings()) return;
    const next = await saveVia(() =>
      replaceTaskTemperatures((cur) => withKey(cur, task, v ?? undefined)),
    );
    if (next) setSettings(next);
  }

  async function setTaskMaxTokens(task: Task, v: number | null): Promise<void> {
    if (!getSettings()) return;
    const next = await saveVia(() =>
      replaceTaskMaxTokens((cur) => withKey(cur, task, v ?? undefined)),
    );
    if (next) setSettings(next);
  }

  async function setTaskReasoningEffort(task: Task, v: ReasoningEffort | null): Promise<void> {
    if (!getSettings()) return;
    const next = await saveVia(() =>
      replaceTaskReasoningEfforts((cur) => withKey(cur, task, v ?? undefined)),
    );
    if (next) setSettings(next);
  }

  async function setTaskTone(task: Task, v: Tone | null): Promise<void> {
    if (!getSettings()) return;
    const next = await saveVia(() => replaceTaskTones((cur) => withKey(cur, task, v ?? undefined)));
    if (next) setSettings(next);
  }

  async function updateRules(next: readonly Rule[]): Promise<void> {
    const saved = await saveVia(() =>
      updateSettings({ advanced: { rules: [...next] } as Settings['advanced'] }),
    );
    if (saved) setSettings(saved);
  }

  async function appendHeaderRule(rule: Rule): Promise<void> {
    // Read under the lock: a snapshot taken before it would revert any sibling key a concurrent write set.
    const next = await saveVia(() => replaceRules((cur) => [...cur, rule]));
    if (next) setSettings(next);
  }

  async function setSnippets(next: Record<string, string>): Promise<void> {
    const saved = await saveVia(() => replaceSnippets(next));
    if (saved) setSettings(saved);
  }

  async function savePerPreset(presetId: string, tpl: PromptTemplate): Promise<void> {
    if (!getSettings()) return;
    const saved = await saveVia(() =>
      replacePerPresetTemplates((cur) => ({ ...cur, [presetId]: tpl })),
    );
    if (saved) setSettings(saved);
  }

  async function clearPerPreset(presetId: string): Promise<void> {
    if (!getSettings()) return;
    const saved = await saveVia(() =>
      replacePerPresetTemplates((cur) => {
        const next = { ...cur };
        delete next[presetId];
        return next;
      }),
    );
    if (saved) setSettings(saved);
  }

  async function setCustomSlotDescription(name: string, description: string): Promise<void> {
    const s = getSettings();
    if (!s) return;
    const shown = s.advanced.customSlotDescriptions;
    if (Object.keys(shown).length >= CUSTOM_SLOTS_MAX && !Object.hasOwn(shown, name)) {
      toastStore.push({
        message: `Custom-variable limit is ${CUSTOM_SLOTS_MAX} — delete one before defining another.`,
        variant: 'warning',
      });
      return;
    }
    const next = await saveVia(() =>
      replaceSettings((cur) => ({
        ...cur,
        advanced: {
          ...cur.advanced,
          customSlotDescriptions: {
            ...cur.advanced.customSlotDescriptions,
            [name.slice(0, SLOT_NAME_MAX)]: description.slice(0, SLOT_DESCRIPTION_MAX),
          },
        },
      })),
    );
    if (next) setSettings(next);
  }

  async function applyRecipeFull(recipe: Recipe): Promise<RecipeApplySnapshot> {
    if (!getSettings()) throw new Error('settings are not loaded');
    const snap: { taken?: RecipeApplySnapshot } = {};
    // One write, read under the lock: the undo snapshot is taken from the row the recipe lands on.
    const saved = await saveVia(() =>
      replaceSettings((cur) => {
        const priorTemplate = cur.advanced.taskTemplates[recipe.task];
        const newRules = filterDupeRecipeRules(recipeRulesToRules(recipe), cur.advanced.rules);
        snap.taken = {
          recipeId: recipe.id,
          task: recipe.task,
          addedRuleIds: newRules.map((r) => r.id),
          template: priorTemplate ? { ...priorTemplate } : undefined,
          tone: cur.advanced.taskTones[recipe.task],
          temperature: cur.taskTemperatures?.[recipe.task],
          maxTokens: cur.taskMaxTokens?.[recipe.task],
          applied: {
            ...(recipe.template ? { template: { ...recipe.template } } : {}),
            ...(recipe.generationParams?.tone ? { tone: recipe.generationParams.tone } : {}),
            ...(typeof recipe.generationParams?.temperature === 'number'
              ? { temperature: recipe.generationParams.temperature }
              : {}),
            ...(typeof recipe.generationParams?.maxTokens === 'number'
              ? { maxTokens: recipe.generationParams.maxTokens }
              : {}),
          },
        };
        const gp = recipe.generationParams;
        return {
          ...cur,
          ...(typeof gp?.temperature === 'number'
            ? { taskTemperatures: { ...cur.taskTemperatures, [recipe.task]: gp.temperature } }
            : {}),
          ...(typeof gp?.maxTokens === 'number'
            ? { taskMaxTokens: { ...cur.taskMaxTokens, [recipe.task]: gp.maxTokens } }
            : {}),
          advanced: {
            ...cur.advanced,
            ...(recipe.template
              ? {
                  taskTemplates: {
                    ...cur.advanced.taskTemplates,
                    [recipe.task]: { ...recipe.template },
                  },
                }
              : {}),
            ...(newRules.length > 0
              ? { rules: appendWithinRulesCap(cur.advanced.rules, newRules) }
              : {}),
            ...(gp?.tone
              ? { taskTones: { ...cur.advanced.taskTones, [recipe.task]: gp.tone } }
              : {}),
          },
        };
      }),
    );
    // A snapshot for a write that never landed would make Undo delete the task's real settings.
    if (!saved || !snap.taken) throw new Error('recipe was not applied');
    setSettings(saved);
    return snap.taken;
  }

  async function undoRecipeApply(pre: RecipeApplySnapshot): Promise<boolean> {
    const { task, applied } = pre;
    // One write, past the deep merge: a key the recipe added has to go, and a later edit has to stay.
    const saved = await saveVia(() =>
      replaceSettings((cur) => ({
        ...cur,
        taskTemperatures: undoKey(cur.taskTemperatures, task, applied.temperature, pre.temperature),
        taskMaxTokens: undoKey(cur.taskMaxTokens, task, applied.maxTokens, pre.maxTokens),
        advanced: {
          ...cur.advanced,
          taskTemplates:
            undoKey(
              cur.advanced.taskTemplates,
              task,
              applied.template,
              pre.template,
              sameTemplate,
            ) ?? {},
          taskTones: undoKey(cur.advanced.taskTones, task, applied.tone, pre.tone) ?? {},
          rules: cur.advanced.rules.filter((r) => !pre.addedRuleIds.includes(r.id)),
        },
      })),
    );
    if (!saved) return false;
    setSettings(saved);
    return true;
  }

  async function applyRecipeRulesOnly(recipe: Recipe): Promise<void> {
    const s = getSettings();
    if (!s) return;
    const candidates = recipeRulesToRules(recipe);
    if (filterDupeRecipeRules(candidates, s.advanced.rules).length === 0) {
      toastStore.push({
        message: `Every rule in "${recipe.label}" is already in your rules.`,
        variant: 'warning',
      });
      return;
    }
    const before = s.advanced.rules.length;
    const saved = await saveVia(() =>
      replaceRules((cur) => appendWithinRulesCap(cur, filterDupeRecipeRules(candidates, cur))),
    );
    if (!saved) return;
    setSettings(saved);
    const added = saved.advanced.rules.length - before;
    if (added > 0) {
      toastStore.push({
        message: `Added ${added} rule${added === 1 ? '' : 's'} from "${recipe.label}".`,
        variant: 'success',
      });
    }
  }

  async function saveRecipeFromCurrent(
    label: string,
    description: string,
    task: Task,
  ): Promise<void> {
    const s = getSettings();
    if (!s) return;
    assertRecipeRoom(s.advanced.userRecipes as readonly Recipe[]);
    const saved = await saveVia(() =>
      replaceSettings((cur) => {
        const tpl = cur.advanced.taskTemplates[task];
        const tempVal = cur.taskTemperatures?.[task];
        const maxTokVal = cur.taskMaxTokens?.[task];
        const tone = cur.advanced.taskTones[task];
        // The dialog promises rules too: every enabled rule that applies to this task, sites and all.
        const rules = cur.advanced.rules
          .filter((r) => r.enabled && (r.scope.tasks.length === 0 || r.scope.tasks.includes(task)))
          .map((r) => ({
            body: r.body,
            category: r.category,
            ...(r.scope.sites && r.scope.sites.length > 0
              ? { scopeSites: [...r.scope.sites] }
              : {}),
          }));
        const recipe: Recipe = {
          id: newRecipeId(),
          task,
          label,
          description,
          ...(tpl ? { template: { ...tpl } } : {}),
          ...(rules.length > 0 ? { rules } : {}),
          generationParams: {
            ...(tempVal !== undefined ? { temperature: tempVal } : {}),
            ...(maxTokVal !== undefined ? { maxTokens: maxTokVal } : {}),
            ...(tone !== undefined ? { tone } : {}),
          },
        };
        return {
          ...cur,
          advanced: { ...cur.advanced, userRecipes: [...cur.advanced.userRecipes, recipe] },
        };
      }),
    );
    if (saved) setSettings(saved);
  }

  async function deleteUserRecipe(id: string): Promise<void> {
    if (!getSettings()) return;
    const saved = await saveVia(() =>
      replaceUserRecipes((cur) => (cur as readonly Recipe[]).filter((r) => r.id !== id)),
    );
    if (saved) setSettings(saved);
  }

  async function importRecipe(encoded: string): Promise<void> {
    const s = getSettings();
    if (!s) return;
    const decoded = deserialiseRecipe(encoded);
    if (!decoded) throw new Error('This does not look like a recipe code.');
    assertRecipeRoom(s.advanced.userRecipes as readonly Recipe[]);
    const recipe: Recipe = { ...decoded, id: newRecipeId() };
    const saved = await saveVia(() => replaceUserRecipes((cur) => [...cur, recipe]));
    if (saved) setSettings(saved);
  }

  return {
    patchAdvanced,
    saveGlobalTemplate,
    resetGlobalTemplate,
    setGlobalTemperature,
    setGlobalMaxTokens,
    setGlobalReasoningEffort,
    setTaskTemplate,
    setTaskBackend,
    setTaskTemperature,
    setTaskMaxTokens,
    setTaskReasoningEffort,
    setTaskTone,
    updateRules,
    appendHeaderRule,
    setSnippets,
    savePerPreset,
    clearPerPreset,
    setCustomSlotDescription,
    applyRecipeFull,
    undoRecipeApply,
    applyRecipeRulesOnly,
    saveRecipeFromCurrent,
    deleteUserRecipe,
    importRecipe,
  };
}
