// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/svelte';
import AnswerPreview from '@/options/components/AnswerPreview.svelte';
import { customAnswerSpec } from '@/shared/answer/custom';
import { parseSettings } from '@/shared/settings-schema';
import { sendMsg } from '@/shared/messages';
import type { CustomTaskInput } from '@/shared/tasks';

vi.mock('@/shared/messages', () => ({ sendMsg: vi.fn() }));
const send = vi.mocked(sendMsg);
const draft: CustomTaskInput = {
  label: 'Outline',
  system: 'Make an outline.',
  user: '{{text}}',
  output: 'plain',
  pageContext: false,
  image: false,
  glossary: false,
  answer: {
    v: 1,
    fields: [{ key: 'outline', label: 'Outline', kind: 'list', role: 'main', required: true }],
  },
};
const spec = customAnswerSpec(draft);
beforeEach(() => {
  send.mockReset();
});
describe('answer preview', () => {
  it('shows sample list items, then a real reply and its field check', async () => {
    send.mockResolvedValueOnce({
      type: 'done',
      requestId: 'test',
      text: 'Actual item',
      answer: { spec, fields: { outline: ['Actual item'] } },
    });
    const view = render(AnswerPreview, { draft, spec, s: parseSettings({}) });
    expect(view.getByText('First sample item')).toBeTruthy();
    await fireEvent.click(view.getByRole('button', { name: 'Try it' }));
    await waitFor(() => expect(view.getByText('Actual item')).toBeTruthy());
    expect(view.getByText('All fields came back')).toBeTruthy();
    expect(send.mock.calls[0]?.[0]).toMatchObject({ kind: 'task:try', draft });
    await view.rerender({ draft: { ...draft, label: 'Renamed' } });
    await waitFor(() => expect(view.queryByText('Actual item')).toBeNull());
    expect(view.getByText('First sample item')).toBeTruthy();
  });
  it('explains an empty sample and stops an in-flight test', async () => {
    send.mockImplementation(() => new Promise(() => {}));
    const view = render(AnswerPreview, { draft, spec, s: parseSettings({}) });
    const input = view.getByLabelText('Sample text');
    await fireEvent.input(input, { target: { value: '' } });
    expect(view.getByRole('button', { name: 'Try it' }).getAttribute('aria-disabled')).toBe('true');
    expect(view.getByText('Add sample text to try this task.')).toBeTruthy();
    await fireEvent.input(input, { target: { value: 'My sample' } });
    await fireEvent.click(view.getByRole('button', { name: 'Try it' }));
    await waitFor(() => expect(view.getByRole('button', { name: 'Stop' })).toBeTruthy());
    const request = send.mock.calls[0]?.[0];
    await fireEvent.click(view.getByRole('button', { name: 'Stop' }));
    expect(send.mock.calls[1]?.[0]).toMatchObject({
      kind: 'translate:cancel',
      requestId: request && 'requestId' in request ? request.requestId : '',
    });
    expect(view.getByText('Stopped')).toBeTruthy();
  });
});
