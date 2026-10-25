import { MAX_THREAD_BYTES, saveThread } from '@/sidepanel/state/conversation-store';
import type { Turn } from '@/sidepanel/state/conversation';

const PNG = 'data:image/png;base64,';
const encoder = new TextEncoder();

function exchange(i: number, image: string): Turn[] {
  return [
    {
      id: `u${i}`,
      role: 'user',
      kind: 'image-translate',
      status: 'idle',
      createdAt: 2 * i + 1,
      content: `photo ${i}`,
      imageDataUrl: image,
      dispatch: { sourceLang: 'auto', targetLang: 'en', stream: true },
    },
    {
      id: `a${i}`,
      role: 'assistant',
      kind: 'image-translate',
      status: 'done',
      createdAt: 2 * i + 2,
      content: `reply ${i}`,
      attachedToTurnId: `u${i}`,
    },
  ] as Turn[];
}

/** Stores two image exchanges `room` bytes under the 512 KB cap, so the next save that adds more drops u0 and a0. */
export async function nearTheByteCap(origin: string, room = 150): Promise<void> {
  const bare = [...exchange(0, PNG), ...exchange(1, PNG)];
  const used = bare.reduce((n, t) => n + encoder.encode(JSON.stringify(t)).length + 1, 0);
  const fill = MAX_THREAD_BYTES - room - used;
  const half = Math.floor(fill / 2);
  const { droppedIds } = await saveThread(origin, [
    ...exchange(0, PNG + 'A'.repeat(half)),
    ...exchange(1, PNG + 'A'.repeat(fill - half)),
  ]);
  if (droppedIds !== undefined) throw new Error('the seed itself went over the cap');
}
