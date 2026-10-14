import type { Turn } from '@/sidepanel/state/conversation';

/** An idle user translate turn; the content defaults to the id. */
export function userTurn(id: string, content: string = id): Turn {
  return { id, role: 'user', kind: 'translate', status: 'idle', createdAt: 1, content };
}
