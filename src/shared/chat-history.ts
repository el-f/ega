// Token-budgeted message history for the side panel's follow-up sends. Pure — no Svelte, no chrome.*.

/** Token budget for the conversation history sent with each request. */
export const CHAT_HISTORY_TOKEN_BUDGET = 4000;

/** Minimal structural contract: only the fields assemblePromptHistory reads. */
export interface ConversationTurnLike {
  role: 'user' | 'assistant';
  /** Turn lifecycle — see conversation.ts TurnStatus. */
  status: string;
  content: string;
}

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

/** Tokens per code point by script. Latin BPE merges land near 4 chars/token; Hebrew, Arabic,
 *  Cyrillic and Indic sit near 2; CJK is about one token per character. */
function tokenCost(cp: number): number {
  if (cp < 0x0250) return 0.25;
  if (cp > 0xffff) return 1;
  if (cp >= 0x3040 && cp <= 0x9fff) return 1;
  if (cp >= 0xac00 && cp <= 0xd7af) return 1;
  return 0.5;
}

/** Cheap heuristic, weighted by script. 0 for empty, min 1 for non-empty. */
export function estimateTokens(s: string): number {
  if (s.length === 0) return 0;
  let total = 0;
  for (const ch of s) total += tokenCost(ch.codePointAt(0) ?? 0);
  return Math.max(1, Math.floor(total));
}

interface AssembleOpts {
  budgetTokens: number;
}

/** Completed turns as ChatTurn[], oldest-first, trimmed from the front to fit the token budget. */
export function assemblePromptHistory(
  turns: readonly ConversationTurnLike[],
  opts: AssembleOpts,
): ChatTurn[] {
  const mapped: ChatTurn[] = [];
  for (let i = 0; i < turns.length; i++) {
    const t = turns[i];
    if (!t) continue;
    if (t.role === 'user') {
      if (t.content.length === 0) continue;
      // An unfinished exchange is not usable context, and counting it would make the label flicker mid-answer.
      const next = turns[i + 1];
      if (next?.role === 'assistant' && next.status !== 'done') continue;
      mapped.push({ role: 'user', content: t.content });
    } else if (t.status === 'done' && t.content.length > 0) {
      mapped.push({ role: 'assistant', content: t.content });
    }
  }
  // Tail-trim: walk from the end accumulating tokens until the budget is hit.
  let used = 0;
  let startIdx = mapped.length;
  for (let i = mapped.length - 1; i >= 0; i--) {
    const cost = estimateTokens(mapped[i]?.content ?? '');
    if (used + cost > opts.budgetTokens) break;
    used += cost;
    startIdx = i;
  }
  const out = mapped.slice(startIdx);
  if (out[0]?.role === 'assistant') out.shift();
  return out;
}

/** UI label for how many prior messages will be sent as context. null when none. */
export function chatContextLabel(
  turns: readonly ConversationTurnLike[],
  opts: { budgetTokens: number },
): string | null {
  const n = assemblePromptHistory(turns, opts).length;
  if (n === 0) return null;
  return `Using ${n} earlier message${n === 1 ? '' : 's'}`;
}
