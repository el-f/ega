import type { Settings } from './types';
import type { Task } from './task-prompts';
import type { TaskEffort } from './settings-schema';
import { computeBackendOrder } from './backends/select';
import { BUILT_IN_TASK_SWITCHES } from './task-view';
import { EFFORT_LEVELS } from './settings-schema';
import { CLOUD_PROVIDER_IDS, apiKeyField, type CloudProviderId } from './provider-ids';

const isCloud = (id: string): id is CloudProviderId =>
  (CLOUD_PROVIDER_IDS as readonly string[]).includes(id);

/** The first enabled backend the router can try: a local one, or a cloud one with a key. Else the head of the chain, else 'anthropic'. */
export function resolveActiveBackendId(s: Settings): string {
  const order = computeBackendOrder(s);
  return order.find((id) => !isCloud(id) || Boolean(s[apiKeyField(id)])) ?? order[0] ?? 'anthropic';
}

/** What a task runs at with no pick of its own: the global Effort, raised to the level the task ships with. */
export function taskDefaultEffort(s: Settings, task: Task): TaskEffort {
  const shipped = BUILT_IN_TASK_SWITCHES[task].effort;
  const global = s.advanced.effort;
  return shipped !== undefined && EFFORT_LEVELS.indexOf(shipped) > EFFORT_LEVELS.indexOf(global)
    ? shipped
    : global;
}

/** The task's own pick, else its default. */
export function resolveTaskEffort(s: Settings, task?: Task): TaskEffort {
  if (task === undefined) return s.advanced.effort;
  return s.taskOverrides[task]?.effort ?? taskDefaultEffort(s, task);
}
