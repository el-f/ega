import type { Rule } from './rules';
import { filterRulesForRequest, renderRulesBlock } from './rules';

/** Rough byte size above which small-context backends (Haiku, Llama 3.2 3B) may blow context. */
export const RULES_BLOCK_WARN_BYTES = 8 * 1024;

function blockBytes(rules: readonly Rule[]): number {
  const block = renderRulesBlock(rules);
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(block).byteLength;
  }
  return block.length;
}

/** Measures the UNCLAMPED block, so the options pane still warns about a set
 *  that `clampRulesToBudget` would trim at request time. */
export function estimateRulesBlockBytes(
  rules: readonly Rule[],
  task: string = 'translate',
  host?: string,
): number {
  return blockBytes(filterRulesForRequest(rules, task, host));
}

/** Input must be filterRulesForRequest output (least specific first); drops from the front so a site rule outlives a global one. */
export function clampRulesToBudget(
  rules: readonly Rule[],
  maxBytes: number = RULES_BLOCK_WARN_BYTES,
): readonly Rule[] {
  let start = 0;
  while (start < rules.length && blockBytes(rules.slice(start)) > maxBytes) start += 1;
  return start === 0 ? rules : rules.slice(start);
}
