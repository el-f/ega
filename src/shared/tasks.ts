/** Writers for tasks, the twin of varieties.ts. */
import { readsPageContext } from './prompts';
import {
  deleteCustomTaskRow,
  getCustomTasks,
  getSettings,
  replaceSettings,
  updateCustomTaskRow,
  upsertCustomTask,
} from './storage';
import { uuid } from './uuid';
import { withoutShippedTaskFields } from './storage/sanitise';
import {
  CONTEXT_MENU_ITEMS_MAX,
  customTaskSchema,
  DEFAULT_PROMPT_TEMPLATE,
  isPromptTemplateCustomised,
  type CustomTask,
  type TaskEdit,
  type TaskEffort,
} from './settings-schema';
import { buildTaskTemplate } from './task-template';
import { type Task } from './task-prompts';
import { hasOwnPrompt } from './task-view';
import type { ContextMenuItem } from './context-menu';
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
  return updateCustomTaskRow(id, (cur) => ({
    ...Object.fromEntries(
      Object.entries(cur).filter(([key]) => !Object.hasOwn(customTaskSchema.entries, key)),
    ),
    ...input,
    id,
    createdAt: cur.createdAt,
  }));
}

/** What one control of the custom-task editor changes; `effort: undefined` goes back to the default. */
export type CustomTaskPatch = Partial<Omit<CustomTaskInput, 'effort'>> & {
  effort?: TaskEffort | undefined;
};

/** Writes only the fields in `patch`, so one field that is not valid never holds back the others. Rejects 'task-gone' like updateCustomTask. */
export function patchCustomTask(id: string, patch: CustomTaskPatch): Promise<CustomTask> {
  return updateCustomTaskRow(id, (cur) => {
    const { effort, ...rest } = { ...cur, ...patch };
    return effort === undefined ? rest : { ...rest, effort };
  });
}

/** The menu with `items` added at the end; 'menu-full' when they do not fit, because the reader keeps only the first 50. */
function withMenuItems(
  cur: readonly ContextMenuItem[],
  items: readonly ContextMenuItem[],
): ContextMenuItem[] {
  const next = [...cur, ...items];
  if (next.length > CONTEXT_MENU_ITEMS_MAX) throw new Error('menu-full');
  return next;
}

/** What a custom-task delete took away, so Undo can put back exactly that. */
export interface DeletedCustomTask {
  row: CustomTask;
  /** Its place in the stored list. */
  index: number;
  menuItems: ContextMenuItem[];
  disabled: boolean;
  wasDefault: boolean;
}

const runsTask = (id: string) => (i: ContextMenuItem) =>
  i.kind === 'task' && (i.task as string) === id;

/** Removes the row, then the right-click items that run it and its on/off and default marks. Rules keep the id and stop applying. */
export async function deleteCustomTask(
  id: string,
): Promise<{ settings: Settings; deleted: DeletedCustomTask | null }> {
  // Read before the row goes: the settings reader drops refs to a task that no longer exists.
  const rows = await getCustomTasks();
  const index = rows.findIndex((t) => t.id === id);
  const row = rows[index];
  const before = await getSettings();
  const deleted: DeletedCustomTask | null = row
    ? {
        row,
        index,
        menuItems: before.contextMenuItems.filter(runsTask(id)),
        disabled: before.disabledTasks.includes(id),
        wasDefault: before.defaultTask === id,
      }
    : null;
  await deleteCustomTaskRow(id);
  // The read path drops these refs too, so a crash between the two writes leaves nothing that runs.
  const settings = await replaceSettings((cur) => ({
    ...cur,
    contextMenuItems: cur.contextMenuItems.filter((i) => !runsTask(id)(i)),
    disabledTasks: cur.disabledTasks.filter((t) => t !== id),
    defaultTask: cur.defaultTask === id ? 'translate' : cur.defaultTask,
  }));
  return { settings, deleted };
}

/** Undo for deleteCustomTask: the same row (id and creation time, so the same place) and every mark it had. */
export async function restoreCustomTask(d: DeletedCustomTask): Promise<Settings> {
  await upsertCustomTask(d.row, d.index);
  return replaceSettings((cur) => ({
    ...cur,
    contextMenuItems: withMenuItems(
      cur.contextMenuItems.filter((i) => !d.menuItems.some((m) => m.id === i.id)),
      d.menuItems,
    ),
    disabledTasks:
      d.disabled && !cur.disabledTasks.includes(d.row.id)
        ? [...cur.disabledTasks, d.row.id]
        : cur.disabledTasks,
    defaultTask: d.wasDefault ? d.row.id : cur.defaultTask,
  }));
}

/** True when some right-click item runs this task. */
export function taskInMenu(s: Settings, id: string): boolean {
  return s.contextMenuItems.some(runsTask(id));
}

/**
 * "Show in right-click menu" for a custom task. On adds one item that runs it at the end of the
 * selected-text group (named after the task); off removes every item that runs it and returns them for Undo.
 */
export async function setTaskInMenu(
  id: string,
  on: boolean,
): Promise<{ settings: Settings; removed: ContextMenuItem[] }> {
  let removed: ContextMenuItem[] = [];
  const settings = await replaceSettings((cur) => {
    if (!on) {
      removed = cur.contextMenuItems.filter(runsTask(id));
      return { ...cur, contextMenuItems: cur.contextMenuItems.filter((i) => !runsTask(id)(i)) };
    }
    if (cur.contextMenuItems.some(runsTask(id))) return cur;
    const order = Math.max(-1, ...cur.contextMenuItems.map((i) => i.order)) + 1;
    const item: ContextMenuItem = {
      id: `ega-task-${id}-${uuid()}`,
      kind: 'task',
      enabled: true,
      order,
      label: '',
      task: id,
      surface: 'tooltip',
    };
    return { ...cur, contextMenuItems: withMenuItems(cur.contextMenuItems, [item]) };
  });
  return { settings, removed };
}

/** Puts back the items setTaskInMenu took off. */
export function restoreMenuItems(items: readonly ContextMenuItem[]): Promise<Settings> {
  return replaceSettings((cur) => ({
    ...cur,
    contextMenuItems: withMenuItems(
      cur.contextMenuItems.filter((i) => !items.some((m) => m.id === i.id)),
      items,
    ),
  }));
}
