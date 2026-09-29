// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import UserTurn from '@/sidepanel/conversation/UserTurn.svelte';
import type { Turn } from '@/sidepanel/state/conversation';

function mkTurn(kind: Turn['kind'], content = 'hello'): Turn {
  return {
    createdAt: 1,
    id: 'u1',
    role: 'user',
    kind,
    status: 'idle',
    content,
  };
}

describe('UserTurn kind badge', () => {
  it.each([
    ['translate', 'Translate'],
    ['ask', 'Ask'],
    ['reword', 'Reword'],
    ['explain', 'Explain'],
    ['image-translate', 'Translate image'],
    ['summarize', 'Summarize'],
    ['grammar', 'Grammar'],
    ['suggest-replies', 'Reply ideas'],
  ] as const)('kind=%s shows badge "%s"', (kind, label) => {
    const { getByText } = render(UserTurn, { props: { turn: mkTurn(kind) } });
    expect(getByText(label)).toBeTruthy();
  });
});
