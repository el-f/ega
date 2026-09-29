import type { Rule, RuleCategory } from './rules';
import { detectCategory } from './rules';
import { uuid } from './uuid';
import { createThinkScrubber } from './backends/think-scrubber';
import type { Task } from './task-prompts';
import { ALL_TASKS } from './task-prompts';

export interface DescribeChangeContext {
  task: Task | 'global';
  host?: string;
}

export interface DescribeChangeResponse {
  category: RuleCategory;
  body: string;
  scope: { tasks: Task[]; sites?: string[] };
}

export const META_PROMPT_SYSTEM = `You convert a user's freeform request into a structured prompt rule for an English-translation Chrome extension. The extension supports tasks: ${ALL_TASKS.join(', ')}. Output JSON ONLY:
{
  "category": "always" | "never" | "prefer" | "format",
  "body": <the imperative as a single short sentence, no leading "the user wants" — write it as a directive to the model, ≤200 chars>,
  "scope": {
    "tasks": <array of task ids the rule applies to; use an empty array when the rule applies to every task>,
    "sites": <optional array of host strings if user mentioned specific sites>
  }
}`;

export function buildMetaPrompt(
  input: string,
  ctx: DescribeChangeContext,
): { system: string; user: string } {
  const taskHint =
    ctx.task !== 'global'
      ? `User is currently configuring the "${ctx.task}" task.`
      : `User is configuring all tasks (global scope).`;
  const hostHint = ctx.host ? `Currently active host: ${ctx.host}.` : '';
  return {
    system: META_PROMPT_SYSTEM,
    user: `${taskHint} ${hostHint}\n\nUser request: ${input}`,
  };
}

export function parseDescribeChangeResponse(raw: string): DescribeChangeResponse | null {
  const scrub = createThinkScrubber();
  const visible = scrub.push(raw) + scrub.flush();
  const first = visible.indexOf('{');
  const last = visible.lastIndexOf('}');
  const candidate = first !== -1 && last > first ? visible.slice(first, last + 1) : visible.trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
  const obj = parsed as Record<string, unknown>;
  const category = obj['category'];
  const body = obj['body'];
  if (typeof body !== 'string' || body.length === 0) return null;
  if (
    category !== 'always' &&
    category !== 'never' &&
    category !== 'prefer' &&
    category !== 'format'
  ) {
    return null;
  }
  const scope = (obj['scope'] as Record<string, unknown> | undefined) ?? {};
  const tasksRaw = scope['tasks'];
  const tasks: Task[] = Array.isArray(tasksRaw)
    ? (tasksRaw.filter((t) => (ALL_TASKS as readonly string[]).includes(t as string)) as Task[])
    : [];
  const sitesRaw = scope['sites'];
  const sites: string[] | undefined = Array.isArray(sitesRaw)
    ? sitesRaw.filter((s): s is string => typeof s === 'string')
    : undefined;
  return {
    category,
    body: body.slice(0, 500),
    scope: sites && sites.length > 0 ? { tasks, sites } : { tasks },
  };
}

export function fallbackDescribeChange(
  input: string,
  ctx: DescribeChangeContext,
): DescribeChangeResponse {
  const cleanBody = input.trim().slice(0, 500);
  const category = detectCategory(cleanBody);
  const tasks: Task[] = ctx.task !== 'global' ? [ctx.task] : [];
  return {
    category,
    body: cleanBody,
    scope: ctx.host ? { tasks, sites: [ctx.host] } : { tasks },
  };
}

export function describeResponseToRule(
  response: DescribeChangeResponse,
  source: Rule['source'] = 'describe',
): Rule {
  return {
    id: uuid(),
    body: response.body,
    category: response.category,
    scope: response.scope,
    source,
    addedAt: new Date().toISOString(),
    enabled: true,
  };
}
