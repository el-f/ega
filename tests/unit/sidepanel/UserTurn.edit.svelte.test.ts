// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/svelte';
import UserTurn from '@/sidepanel/conversation/UserTurn.svelte';
import type { UserTurnData } from '@/sidepanel/state/conversation';

function mkTurn(overrides: Partial<UserTurnData> = {}): UserTurnData {
  return {
    id: 'u1',
    role: 'user',
    createdAt: 1,
    kind: 'translate',
    status: 'idle',
    content: 'hello source',
    ...overrides,
  };
}

describe('UserTurn — edit button', () => {
  it('renders [data-ega-edit] button', () => {
    const { container } = render(UserTurn, { props: { turn: mkTurn() } });
    expect(container.querySelector('[data-ega-edit]')).not.toBeNull();
  });

  it('edit click fires onEdit(turn.id)', async () => {
    const onEdit = vi.fn();
    const { container } = render(UserTurn, { props: { turn: mkTurn(), onEdit } });
    const btn = container.querySelector<HTMLButtonElement>('[data-ega-edit]');
    if (!btn) throw new Error('edit btn missing');
    await fireEvent.click(btn);
    expect(onEdit).toHaveBeenCalledWith('u1');
  });

  it('edit click does not throw when onEdit is not provided', async () => {
    const { container } = render(UserTurn, { props: { turn: mkTurn() } });
    const btn = container.querySelector<HTMLButtonElement>('[data-ega-edit]');
    if (!btn) throw new Error('edit btn missing');
    await expect(fireEvent.click(btn)).resolves.toBe(true);
  });
});

describe('UserTurn — no edit on an image turn whose image is gone', () => {
  it.each([
    ['an image translate', { kind: 'image-translate' as const, content: 'some OCR text' }],
    ['the image placeholder', { kind: 'explain' as const, content: '[image]' }],
  ])('%s has no edit button, so "[image]" never reaches the composer', (_name, over) => {
    const { container } = render(UserTurn, { props: { turn: mkTurn(over) } });
    expect(container.querySelector('[data-ega-edit]')).toBeNull();
  });
});
