/** Writers for tasks, the twin of varieties.ts. */
import { readsPageContext } from './prompts';
import {
  deleteCustomTaskRow,
  replaceSettings,
  updateCustomTaskRow,
  upsertCustomTask,
} from './storage';
import { uuid } from './uuid';
import { withoutShippedTaskFields } from './storage/sanitise';
import {
  DEFAULT_PROMPT_TEMPLATE,
  isPromptTemplateCustomised,
  type CustomTask,
  type TaskEdit,
} from './settings-schema';
import { buildTaskTemplate, type Task } from './task-prompts';
import { hasOwnPrompt } from './task-view';
import type { PromptTemplate, Settings } from './types';

function promptOf(id: Task, edit: TaskEdit | undefined): Partial<PromptTemplate> {
  if (!hasOwnPrompt(id)) return {};
  const shipped = buildTaskTemplate(id);
  return { system: edit?.system ?? shipped.system, user: edit?.user ?? shipped.user };
}

/** A prompt change that adds a {{context}} slot turns page context on; one that removes the slot turns it off. */
function followContextSlot(
  id: Task,
  before: TaskEdit | undefined,
  after: TaskEdit,
  snippets: Record<string, string>,
): TaskEdit {
  const had = readsPageContext(promptOf(id, before), snippets);
  const has = readsPageContext(promptOf(id, after), snippets);
  if (had === has) return after;
  if (has) return { ...after, pageContext: true };
  const { pageContext: _p, ...rest } = after;
  void _p;
  return rest;
}

/** `overrides` with the task's edit replaced, pruned against the shipped task. */
function putTaskEdit(
  overrides: Settings['taskOverrides'],
  id: Task,
  edit: TaskEdit,
): Settings['taskOverrides'] {
  const pruned = withoutShippedTaskFields(id, edit);
  const out = { ...overrides };
  if (Object.keys(pruned).length > 0) out[id] = pruned;
  else delete out[id];
  return out;
}

/** Turns a task on or off. Translate is always on. */
export function setTaskEnabled(id: string, on: boolean): Promise<Settings> {
  if (id === 'translate') return Promise.reject(new Error('Translate is always on.'));
  return replaceSettings((cur) => {
    const rest = cur.disabledTasks.filter((t) => t !== id);
    return { ...cur, disabledTasks: on ? rest : [...rest, id] };
  });
}

/** Replaces a built-in's whole edit, so a field can be removed; a transform reads the current edit under the lock. */
export function replaceTaskEdit(
  id: Task,
  next: TaskEdit | ((cur: TaskEdit | undefined) => TaskEdit),
): Promise<Settings> {
  return replaceSettings((cur) => ({
    ...cur,
    taskOverrides: putTaskEdit(
      cur.taskOverrides,
      id,
      typeof next === 'function' ? next(cur.taskOverrides[id]) : next,
    ),
  }));
}

/** What a reset took away: the task's edit, and for Translate the prompt it reset with it. */
export interface RemovedTask {
  edit: TaskEdit | undefined;
  prompt?: { template: PromptTemplate; version: number };
}

/** Drops every edit of a built-in. Translate also goes back to the shipped prompt, which Explain and every language without its own prompt use. */
export async function resetTask(id: Task): Promise<{ settings: Settings; removed: RemovedTask }> {
  const removed: RemovedTask = { edit: undefined };
  const settings = await replaceSettings((cur) => {
    removed.edit = cur.taskOverrides[id];
    const next = { ...cur, taskOverrides: putTaskEdit(cur.taskOverrides, id, {}) };
    if (id !== 'translate' || !isPromptTemplateCustomised(cur.advanced.promptTemplate)) return next;
    removed.prompt = {
      template: cur.advanced.promptTemplate,
      version: cur.advanced.templateVersion,
    };
    return {
      ...next,
      advanced: { ...cur.advanced, promptTemplate: { ...DEFAULT_PROMPT_TEMPLATE } },
    };
  });
  return { settings, removed };
}

/** Puts back what resetTask took, in one write. */
export function restoreTask(id: Task, removed: RemovedTask): Promise<Settings> {
  return replaceSettings((cur) => ({
    ...cur,
    taskOverrides: putTaskEdit(cur.taskOverrides, id, removed.edit ?? {}),
    ...(removed.prompt
      ? {
          advanced: {
            ...cur.advanced,
            promptTemplate: removed.prompt.template,
            templateVersion: removed.prompt.version,
          },
        }
      : {}),
  }));
}

/** Merges `patch` into a built-in task's edit. A field set to its shipped value drops out, which is how one field resets. */
export function updateTask(id: Task, patch: TaskEdit): Promise<Settings> {
  return replaceSettings((cur) => {
    const before = cur.taskOverrides[id];
    const merged = { ...before, ...patch };
    // A page-context value in the patch is the user's own choice, so the slot rule stays out of it.
    const edit =
      patch.pageContext !== undefined
        ? merged
        : followContextSlot(id, before, merged, cur.advanced.snippets);
    return { ...cur, taskOverrides: putTaskEdit(cur.taskOverrides, id, edit) };
  });
}

/** What the custom-task editor writes; the id and creation time are the writer's. */
export type CustomTaskInput = Omit<CustomTask, 'id' | 'createdAt'>;

export async function addCustomTask(input: CustomTaskInput): Promise<CustomTask> {
  const row: CustomTask = { ...input, id: uuid(), createdAt: Date.now() };
  await upsertCustomTask(row);
  return row;
}

/** Rejects 'task-gone' when another window deleted the row, so an edit never brings it back. */
export function updateCustomTask(id: string, input: CustomTaskInput): Promise<CustomTask> {
  return updateCustomTaskRow(id, (cur) => ({ ...input, id, createdAt: cur.createdAt }));
}

/** Removes the row, then the right-click items that run it and its on/off and default marks. Rules keep the id and stop applying. */
export async function deleteCustomTask(id: string): Promise<Settings> {
  await deleteCustomTaskRow(id);
  // The read path drops these refs too, so a crash between the two writes leaves nothing that runs.
  return replaceSettings((cur) => ({
    ...cur,
    contextMenuItems: cur.contextMenuItems.filter(
      (i) => !(i.kind === 'task' && (i.task as string) === id),
    ),
    disabledTasks: cur.disabledTasks.filter((t) => t !== id),
    defaultTask: cur.defaultTask === id ? 'translate' : cur.defaultTask,
  }));
}
