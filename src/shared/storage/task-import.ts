import { STORAGE_KEYS } from '../constants';
import { ALL_TASKS } from '../task-prompts';
import {
  CURRENT_TEMPLATE_VERSION,
  DEFAULT_PROMPT_TEMPLATE,
  CONTEXT_MENU_ITEMS_MAX,
} from '../settings-schema';
import type { Settings } from '../types';
import type { CustomTask } from '../settings-schema';
import { getCustomTasks, getSettings, withCustomTasksLock, withSettingsLock } from '../storage';
import { CUSTOM_TASKS_MAX } from './sanitise';
import type { ImportBundle } from './backup';

type Plan = Extract<ImportBundle, { kind: 'tasks' }>;
export interface TaskImportResult {
  added: number;
  updated: number;
  skipped: number;
  undo: () => Promise<void>;
}
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

function restoreMap<T>(
  current: Record<string, T>,
  before: Record<string, T>,
  applied: Record<string, T>,
  keys: readonly string[],
): Record<string, T> {
  const next = { ...current };
  for (const key of keys) {
    if (!same(current[key], applied[key])) continue;
    const original = before[key];
    if (original === undefined) delete next[key];
    else next[key] = original;
  }
  return next;
}

/** A single storage write under both locks. Undo compares only imported IDs, preserving subsequent edits. */
export function mergeTaskImport(plan: Plan): Promise<TaskImportResult> {
  return withSettingsLock(() =>
    withCustomTasksLock(async () => {
      const [before, originalRows] = await Promise.all([getSettings(), getCustomTasks()]);
      const rows = [...originalRows];
      const appliedRows = new Map<string, CustomTask>();
      let added = 0;
      let updated = 0;
      let skipped = 0;
      for (const row of plan.customTasks) {
        const index = rows.findIndex((current) => current.id === row.id);
        if (index >= 0) {
          rows[index] = row;
          updated++;
        } else if (rows.length < CUSTOM_TASKS_MAX) {
          rows.push(row);
          added++;
        } else {
          skipped++;
          continue;
        }
        appliedRows.set(row.id, row);
      }
      const scope = new Set<string>([...ALL_TASKS, ...appliedRows.keys()]);
      const disabledTasks =
        plan.disabledTasksPresent === false
          ? before.disabledTasks
          : [
              ...before.disabledTasks.filter((id) => !scope.has(id)),
              ...plan.disabledTasks.filter((id) => scope.has(id)),
            ];
      const menus = [...before.contextMenuItems];
      const appliedMenus = new Map<string, Settings['contextMenuItems'][number]>();
      for (const item of plan.contextMenuItems ?? []) {
        if ((item.kind !== 'task' && item.kind !== 'image-task') || !appliedRows.has(item.task)) {
          skipped++;
          continue;
        }
        const index = menus.findIndex((current) => current.id === item.id);
        if (index >= 0) menus[index] = item;
        else if (menus.length < CONTEXT_MENU_ITEMS_MAX) menus.push(item);
        else {
          skipped++;
          continue;
        }
        appliedMenus.set(item.id, item);
      }
      const tp = plan.translatePrompt;
      const { templateVersionAcknowledged: _ack, ...advanced } = before.advanced;
      const applied: Settings = {
        ...before,
        taskOverrides: { ...before.taskOverrides, ...plan.taskOverrides },
        disabledTasks,
        contextMenuItems: menus,
        advanced: {
          ...(tp === undefined
            ? before.advanced
            : {
                ...advanced,
                promptTemplate: tp?.template ?? { ...DEFAULT_PROMPT_TEMPLATE },
                templateVersion: tp?.version ?? CURRENT_TEMPLATE_VERSION,
              }),
          snippets: { ...before.advanced.snippets, ...plan.snippets },
        },
      };
      await chrome.storage.local.set({
        [STORAGE_KEYS.customTasks]: rows,
        [STORAGE_KEYS.settings]: applied,
      });
      let undone = false;
      return {
        added,
        updated,
        skipped,
        undo: () =>
          withSettingsLock(() =>
            withCustomTasksLock(async () => {
              if (undone) return;
              const [current, currentRows] = await Promise.all([getSettings(), getCustomTasks()]);
              const restoredRows = currentRows.flatMap((row) => {
                if (!appliedRows.has(row.id) || !same(row, appliedRows.get(row.id))) return [row];
                const old = originalRows.find((original) => original.id === row.id);
                return old ? [old] : [];
              });
              const restoredMenus = current.contextMenuItems.flatMap((item) => {
                if (!appliedMenus.has(item.id) || !same(item, appliedMenus.get(item.id)))
                  return [item];
                const old = before.contextMenuItems.find((original) => original.id === item.id);
                return old ? [old] : [];
              });
              const disabled = new Set(current.disabledTasks);
              if (plan.disabledTasksPresent !== false)
                for (const id of scope) {
                  if (disabled.has(id) !== applied.disabledTasks.includes(id)) continue;
                  if (before.disabledTasks.includes(id)) disabled.add(id);
                  else disabled.delete(id);
                }
              let nextAdvanced = {
                ...current.advanced,
                snippets: restoreMap(
                  current.advanced.snippets,
                  before.advanced.snippets,
                  applied.advanced.snippets,
                  Object.keys(plan.snippets ?? {}),
                ),
              };
              if (
                tp !== undefined &&
                same(current.advanced.promptTemplate, applied.advanced.promptTemplate) &&
                current.advanced.templateVersion === applied.advanced.templateVersion
              ) {
                const { templateVersionAcknowledged: _currentAck, ...rest } = nextAdvanced;
                nextAdvanced = {
                  ...rest,
                  promptTemplate: before.advanced.promptTemplate,
                  templateVersion: before.advanced.templateVersion,
                  ...(before.advanced.templateVersionAcknowledged === undefined
                    ? {}
                    : { templateVersionAcknowledged: before.advanced.templateVersionAcknowledged }),
                };
              }
              await chrome.storage.local.set({
                [STORAGE_KEYS.customTasks]: restoredRows,
                [STORAGE_KEYS.settings]: {
                  ...current,
                  contextMenuItems: restoredMenus,
                  disabledTasks: [...disabled],
                  advanced: nextAdvanced,
                  taskOverrides: restoreMap(
                    current.taskOverrides,
                    before.taskOverrides,
                    applied.taskOverrides,
                    Object.keys(plan.taskOverrides),
                  ),
                },
              });
              undone = true;
            }),
          ),
      };
    }),
  );
}
