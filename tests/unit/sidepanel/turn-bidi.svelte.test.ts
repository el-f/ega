// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import UserTurn from '@/sidepanel/conversation/UserTurn.svelte';
import Markdown from '@/shared/components/Markdown.svelte';
import type { Turn } from '@/sidepanel/state/conversation';

// The panel is LTR but turns are often Arabic or Hebrew; without dir="auto" punctuation and alignment break.
describe('turn content bidi isolation', () => {
  it('UserTurn text container resolves direction from its content', () => {
    const turn: Turn = {
      createdAt: 1,
      id: 'u1',
      role: 'user',
      kind: 'translate',
      status: 'idle',
      content: 'مرحبا بالعالم',
    };
    const { container } = render(UserTurn, { props: { turn } });
    const text = container.querySelector('.ega-user-text');
    if (!text) throw new Error('no .ega-user-text');
    expect(text.getAttribute('dir')).toBe('auto');
  });

  it('Markdown wrapper resolves direction from its content', () => {
    const { container } = render(Markdown, { props: { text: 'مرحبا' } });
    const md = container.querySelector('.ega-md');
    if (!md) throw new Error('no .ega-md');
    expect(md.getAttribute('dir')).toBe('auto');
  });
});
