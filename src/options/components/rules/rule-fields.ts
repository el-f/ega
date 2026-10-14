import {
  normaliseSiteEntry,
  ruleCategoryLabel,
  type Rule,
  type RuleCategory,
} from '@/shared/rules';
import { taskLabel, type TaskView } from '@/shared/task-view';

/** What the rule editor holds; `tasks` empty means every task. */
export interface RuleDraft {
  body: string;
  category: RuleCategory;
  tasks: string[];
  sites: string[];
}

export const RULE_TYPES: readonly RuleCategory[] = [
  'always',
  'never',
  'prefer',
  'format',
  'unknown',
];

/** "Always", "Other": a type name, never the stored value. */
export function ruleTypeLabel(c: RuleCategory): string {
  const word = ruleCategoryLabel(c);
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/** The stored hosts for a typed list: split on commas, normalised, no blanks or repeats. */
export function parseSites(raw: string): string[] {
  return [
    ...new Set(
      raw
        .split(',')
        .map(normaliseSiteEntry)
        .filter((s) => s !== ''),
    ),
  ];
}

/** The scope a rule stores: no `sites` key when the list is empty. */
export function ruleScope(tasks: readonly string[], sites: readonly string[]): Rule['scope'] {
  return sites.length > 0 ? { tasks: [...tasks], sites: [...sites] } : { tasks: [...tasks] };
}

/** One muted line under a rule: "Always · All tasks · twitter.com". */
export function ruleMeta(rule: Rule, views: readonly TaskView[]): string {
  const tasks =
    rule.scope.tasks.length === 0
      ? 'All tasks'
      : rule.scope.tasks.map((t) => taskLabel(views, t)).join(', ');
  return [ruleTypeLabel(rule.category), tasks, ...(rule.scope.sites ?? [])].join(' · ');
}
