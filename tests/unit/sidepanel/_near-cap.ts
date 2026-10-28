import { MAX_THREAD_BYTES, saveThread } from '@/sidepanel/state/conversation-store';
import type { Turn } from '@/sidepanel/state/conversation';

const encoder = new TextEncoder();

function exchange(i: number, filler: string): Turn[] {
  return [
    {
      id: `u${i}`,
      role: 'user',
      kind: 'translate',
      status: 'idle',
      createdAt: 2 * i + 1,
      content: `text ${i}${filler}`,
      dispatch: { sourceLang: 'auto', targetLang: 'en', stream: true },
    },
    {
      id: `a${i}`,
      role: 'assistant',
      kind: 'translate',
      status: 'done',
      createdAt: 2 * i + 2,
      content: `reply ${i}`,
      attachedToTurnId: `u${i}`,
    },
  ] as Turn[];
}

/** Stores two text exchanges `room` bytes under the 512 KB cap, so the next save that adds more drops u0 and a0. Text: the cap sheds an image before it drops a turn. */
export async function nearTheByteCap(origin: string, room = 150): Promise<void> {
  const bare = [...exchange(0, ''), ...exchange(1, '')];
  const used = bare.reduce((n, t) => n + encoder.encode(JSON.stringify(t)).length + 1, 0);
  const fill = MAX_THREAD_BYTES - room - used;
  const half = Math.floor(fill / 2);
  const { droppedIds } = await saveThread(origin, [
    ...exchange(0, 'A'.repeat(half)),
    ...exchange(1, 'A'.repeat(fill - half)),
  ]);
  if (droppedIds !== undefined) throw new Error('the seed itself went over the cap');
}
