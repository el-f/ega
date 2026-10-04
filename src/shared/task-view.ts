/** The merged task list every picker reads. Pure. No eager content-script module may import it. */
import { ALL_TASKS, TASK_LABELS, buildTaskTemplate, builtInTask, type Task } from './task-prompts';
import type { CustomTask, TaskEdit, TaskEffort } from './settings-schema';
import { resolveSnippets } from './snippets';
import type { PromptTemplate, Settings } from './types';

/** A built-in task id, or a custom task's uuid. */
export type TaskId = string;

/** UI: "Answer only" / "Answer with notes". */
export type OutputShape = 'plain' | 'card';

export interface TaskSwitches {
  output: OutputShape;
  pageContext: boolean;
  image: boolean;
  glossary: boolean;
  /** Absent: the global Effort. */
  effort?: TaskEffort;
}

export interface TaskView extends TaskSwitches {
  id: TaskId;
  kind: 'builtin' | 'custom';
  label: string;
  /** The prompt this task runs contains {{tone}}. */
  usesTone: boolean;
  disabled: boolean;
  hasOverrides: boolean;
}

/** What runs today: only Translate and Explain read page context, the glossary and images. */
export const BUILT_IN_TASK_SWITCHES: Readonly<Record<Task, TaskSwitches>> = {
  translate: { output: 'card', pageContext: true, image: true, glossary: true },
  // Explain and Ask reason more than a one-line answer; the rest follow the global Effort.
  explain: { output: 'card', pageContext: true, image: true, glossary: true, effort: 'low' },
  summarize: { output: 'plain', pageContext: false, image: false, glossary: false },
  reword: { output: 'card', pageContext: false, image: false, glossary: false },
  grammar: { output: 'card', pageContext: false, image: false, glossary: false },
  'suggest-replies': { output: 'plain', pageContext: false, image: false, glossary: false },
  ask: { output: 'plain', pageContext: false, image: false, glossary: false, effort: 'low' },
};

/** Translate and Explain run the language template; every other built-in has a prompt of its own. */
export function hasOwnPrompt(t: Task): boolean {
  return t !== 'translate' && t !== 'explain';
}

export const TONE_SLOT = /\{\{tone\}\}/;

/** The prompt a built-in with its own prompt runs: each half is the user's edit, else the shipped half. */
export function ownTaskPrompt(s: Settings, t: Task): PromptTemplate {
  const shipped = buildTaskTemplate(t);
  const edit = s.taskOverrides[t];
  return { system: edit?.system ?? shipped.system, user: edit?.user ?? shipped.user };
}

/** Translate is always on, whatever `disabledTasks` holds. */
function builtInOff(s: Settings, t: Task): boolean {
  return t !== 'translate' && s.disabledTasks.includes(t);
}

/** Built-ins the user has on, in shipped order. */
export function enabledBuiltIns(s: Settings): Task[] {
  return ALL_TASKS.filter((t) => !builtInOff(s, t));
}

/** The view of a built-in task; a built-in id always has one. */
export function builtInTaskView(s: Settings, t: Task): TaskView {
  const edit: TaskEdit = s.taskOverrides[t] ?? {};
  const shipped = BUILT_IN_TASK_SWITCHES[t];
  const prompt = hasOwnPrompt(t) ? ownTaskPrompt(s, t) : s.advanced.promptTemplate;
  const effort = edit.effort ?? shipped.effort;
  return {
    id: t,
    kind: 'builtin',
    label: TASK_LABELS[t],
    output: shipped.output,
    image: shipped.image,
    pageContext: edit.pageContext ?? shipped.pageContext,
    glossary: edit.glossary ?? shipped.glossary,
    ...(effort !== undefined ? { effort } : {}),
    // Snippets expand before slots fill, so a {{tone}} inside one counts, as it does in the router.
    usesTone: TONE_SLOT.test(resolveSnippets(prompt.system + prompt.user, s.advanced.snippets)),
    disabled: builtInOff(s, t),
    hasOverrides: Object.hasOwn(s.taskOverrides, t),
  };
}

function customView(s: Settings, c: CustomTask): TaskView {
  return {
    id: c.id,
    kind: 'custom',
    label: c.label,
    // A kept row can carry an output value this build does not know.
    output: c.output === 'card' ? 'card' : 'plain',
    pageContext: c.pageContext,
    image: c.image,
    glossary: c.glossary,
    ...(c.effort !== undefined ? { effort: c.effort } : {}),
    usesTone: TONE_SLOT.test(c.system + c.user),
    disabled: s.disabledTasks.includes(c.id),
    hasOverrides: false,
  };
}

/** The built-ins as shipped, for a surface whose settings have not loaded. */
export const SHIPPED_TASK_VIEWS: readonly TaskView[] = ALL_TASKS.map((t) => {
  const tpl = hasOwnPrompt(t) ? buildTaskTemplate(t) : null;
  return {
    id: t,
    kind: 'builtin' as const,
    label: TASK_LABELS[t],
    ...BUILT_IN_TASK_SWITCHES[t],
    usesTone: tpl !== null && TONE_SLOT.test(tpl.system + tpl.user),
    disabled: false,
    hasOverrides: false,
  };
});

/** Built-ins in shipped order, then custom tasks by creation time. */
export function materializeTasks(
  s: Settings,
  customs: readonly CustomTask[],
  opts?: { enabledOnly?: boolean },
): TaskView[] {
  const seen = new Set<string>(ALL_TASKS);
  const rows: CustomTask[] = [];
  for (const c of customs) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    rows.push(c);
  }
  rows.sort((a, b) => a.createdAt - b.createdAt);
  const all = [
    ...ALL_TASKS.map((t) => builtInTaskView(s, t)),
    ...rows.map((c) => customView(s, c)),
  ];
  return opts?.enabledOnly ? all.filter((v) => !v.disabled) : all;
}

/** One task by id, on or off; null when no task has the id. */
export function findTask(s: Settings, customs: readonly CustomTask[], id: string): TaskView | null {
  const t = builtInTask(id);
  if (t !== null) return builtInTaskView(s, t);
  const c = customs.find((row) => row.id === id);
  return c ? customView(s, c) : null;
}

/** The heading over an answer's notes. The tooltip's Explain button runs Translate with the explain brief, so Translate's notes explain the text too. */
export function notesLabel(id: string): string {
  return id === 'translate' || id === 'explain' ? 'Context & subtext' : 'Notes';
}

/** A task's name for a label or a pill; "Deleted task" for an id no task has. */
/** A built-in id, or the id of a task the list still has. */
export function taskExists(views: readonly TaskView[], id: string): boolean {
  return views.some((x) => x.id === id) || builtInTask(id) !== null;
}

export function taskLabel(views: readonly TaskView[], id: string): string {
  const v = views.find((x) => x.id === id);
  if (v) return v.label;
  const t = builtInTask(id);
  return t !== null ? TASK_LABELS[t] : 'Deleted task';
}
