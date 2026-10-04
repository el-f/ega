import {
  activeVariant,
  errorTurnParts,
  isCancelledError,
  turnLabel,
  type Turn,
} from './conversation';
import { IMAGE_TURN_PLACEHOLDER } from '@/shared/constants';
import type { TaskView } from '@/shared/task-view';

/** One line, the provider fragment included: a bug report pastes the export. */
function failedLine(err: NonNullable<Turn['error']>): string {
  const { title, body, detail } = errorTurnParts(err);
  const text = [title, body].filter(Boolean).join(': ');
  return `_Failed: ${text}${detail !== undefined ? ` (${detail})` : ''}_`;
}

/** The active variant is authoritative; a shrunk stored turn has none and falls back to the Turn body. */
function assistantBlock(turn: Turn): string | null {
  const v = activeVariant(turn);
  const parts: string[] = [];
  const body = v?.content ?? turn.content;
  if (body) parts.push(body);
  const err = v?.error ?? turn.error;
  if (err) parts.push(isCancelledError(err.code) ? '_Canceled._' : failedLine(err));
  const explain = v?.explain ?? turn.explain;
  if (explain) parts.push(`_Explain:_ ${explain}`);
  return parts.length > 0 ? `**Ega:** ${parts.join('\n\n')}` : null;
}

export function exportMarkdown(turns: readonly Turn[], views: readonly TaskView[] = []): string {
  const blocks: string[] = [];
  for (const turn of turns) {
    if (turn.role === 'user') {
      const label = turnLabel(turn, views);
      const body = turn.imageDataUrl ? IMAGE_TURN_PLACEHOLDER : turn.content;
      if (!body) continue;
      blocks.push(`**You (${label}):** ${body}`);
    } else {
      const block = assistantBlock(turn);
      if (block !== null) blocks.push(block);
    }
  }
  return blocks.join('\n\n');
}

export function exportJson(turns: readonly Turn[]): string {
  return JSON.stringify(
    turns.map((t) => {
      const v = activeVariant(t);
      const error = v?.error ?? t.error;
      const explain = v?.explain ?? t.explain;
      return {
        id: t.id,
        role: t.role,
        kind: t.kind,
        ...(t.taskId !== undefined ? { taskId: t.taskId } : {}),
        content: v?.content ?? t.content,
        createdAt: t.createdAt,
        bookmarked: t.bookmarked,
        attachedToTurnId: t.attachedToTurnId,
        ...(error ? { error } : {}),
        ...(explain ? { explain } : {}),
        // The data URL itself is megabytes; the reader only needs to know a turn had one.
        ...(t.imageDataUrl ? { hasImage: true } : {}),
      };
    }),
    null,
    2,
  );
}
