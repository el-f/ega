import type { Rule } from '@/shared/rules';

export type SourceVariant = 'default' | 'success' | 'muted';

/** Single source of truth for the source badge shown in BOTH rule list
 *  views (RulesEditorRow + RulesEditorPillList) so they can't diverge. */
export function sourceLabel(r: Rule): string {
  if (r.source === 'recipe') return r.recipeId ?? 'recipe';
  if (r.source === 'describe') return 'AI';
  return 'manual';
}

export function sourceVariant(r: Rule): SourceVariant {
  if (r.source === 'recipe') return 'success';
  if (r.source === 'describe') return 'default';
  return 'muted';
}
