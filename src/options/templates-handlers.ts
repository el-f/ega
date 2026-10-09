import { updateSettings } from '@/shared/storage';
import { DEFAULT_TEMPLATE } from '@/shared/prompts';
import { updateTask } from '@/shared/tasks';
import type { Rule } from '@/shared/rules';
import { saveVia, showSettingsWrite } from './storage-with-toast';
import type { Settings, PromptTemplate } from '@/shared/types';
import { buildTaskTemplate } from '@/shared/task-template';
import { type Task } from '@/shared/task-prompts';

type Effort = Settings['advanced']['effort'];

export interface TemplatesHandlerCtx {
  /** The tab's settings, read only for guards and caps; every write reads the stored row under the lock. */
  getSettings: () => Settings | null;
  setSettings: (next: Settings) => void;
}

export interface TemplatesHandlers {
  patchAdvanced: (p: Partial<Settings['advanced']>) => Promise<void>;
  saveGlobalTemplate: (tpl: PromptTemplate) => Promise<void>;
  resetGlobalTemplate: () => Promise<void>;
  setGlobalTemperature: (v: number) => Promise<void>;
  setGlobalMaxTokens: (v: number) => Promise<void>;
  setGlobalEffort: (v: Effort) => Promise<void>;
  setTaskTemplate: (task: Task, tpl: PromptTemplate | null) => Promise<void>;
  /** False when the write failed; the user has already been told. */
  updateRules: (next: readonly Rule[]) => Promise<boolean>;
}

export function createTemplatesHandlers(ctx: TemplatesHandlerCtx): TemplatesHandlers {
  const { getSettings, setSettings } = ctx;

  async function patchAdvanced(p: Partial<Settings['advanced']>): Promise<void> {
    // `Partial<Settings>` types `advanced` as full Settings['advanced']; updateSettings
    // deep-merges internally so a Partial<advanced> patch is valid at runtime.
    await showSettingsWrite(
      await saveVia(() => updateSettings({ advanced: p as Settings['advanced'] })),
      setSettings,
    );
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

  async function setGlobalEffort(v: Effort): Promise<void> {
    await patchAdvanced({ effort: v });
  }

  // Null writes the shipped halves, which the prune drops, so only the prompt resets.
  async function setTaskTemplate(task: Task, tpl: PromptTemplate | null): Promise<void> {
    if (!getSettings()) return;
    await showSettingsWrite(
      await saveVia(() => updateTask(task, tpl ?? buildTaskTemplate(task))),
      setSettings,
    );
  }

  async function updateRules(next: readonly Rule[]): Promise<boolean> {
    const saved = await saveVia(() =>
      updateSettings({ advanced: { rules: [...next] } as Settings['advanced'] }),
    );
    return showSettingsWrite(saved, setSettings);
  }

  return {
    patchAdvanced,
    saveGlobalTemplate,
    resetGlobalTemplate,
    setGlobalTemperature,
    setGlobalMaxTokens,
    setGlobalEffort,
    setTaskTemplate,
    updateRules,
  };
}
