// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import UserTurn from '@/sidepanel/conversation/UserTurn.svelte';
import type { UserTurnData } from '@/sidepanel/state/conversation';

function mkTurn(kind: UserTurnData['kind'], content = 'hello'): UserTurnData {
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

describe('UserTurn trim note', () => {
  it('says how much of a cut message was sent', () => {
    const { container } = render(UserTurn, {
      props: { turn: { ...mkTurn('translate'), trimmedTo: 2000 } },
    });
    expect(container.querySelector('.ega-user-trimmed')?.textContent).toBe(
      'Only the first 2000 characters were sent.',
    );
  });

  it('shows nothing for a message sent whole', () => {
    const { container } = render(UserTurn, { props: { turn: mkTurn('translate') } });
    expect(container.querySelector('.ega-user-trimmed')).toBeNull();
  });
});
