// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import CloudProviderCard from '@/options/components/CloudProviderCard.svelte';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import type { Settings } from '@/shared/types';
import { asBackendIdUnsafe } from '@/shared/brands';
import { setFetchHandler, clearFetchHandler } from '../../mocks/fetch';

beforeEach(() => clearFetchHandler());

function settings(): Settings {
  return DEFAULT_SETTINGS as Settings;
}

const baseProps = {
  id: asBackendIdUnsafe('openai'),
  label: 'OpenAI',
  description: 'GPT-class chat models.',
  signupUrl: 'https://platform.openai.com/api-keys',
  keyPlaceholder: 'sk-…',
  apiKey: 'sk-test',
  model: 'gpt-4o',
  disabled: false,
  onApiKeyChange: vi.fn(async () => true),
  onModelChange: vi.fn(),
};

describe('CloudProviderCard', () => {
  it('renders the provider label as the card heading', async () => {
    const { findByText } = render(CloudProviderCard, {
      props: { ...baseProps, settings: settings() },
    });
    expect(await findByText('OpenAI')).toBeTruthy();
  });

  it('starts with the api-key input as type=password (key hidden by default)', async () => {
    const { container } = render(CloudProviderCard, {
      props: { ...baseProps, settings: settings() },
    });
    await tick();
    const input = container.querySelector('.cp-key-input') as HTMLInputElement;
    expect(input.type).toBe('password');
  });

  it('Show API key IconButton flips type to text', async () => {
    const { container, getByRole } = render(CloudProviderCard, {
      props: { ...baseProps, settings: settings() },
    });
    await tick();
    const showBtn = getByRole('button', { name: /Show API key/i });
    await fireEvent.click(showBtn);
    await tick();
    const input = container.querySelector('.cp-key-input') as HTMLInputElement;
    expect(input.type).toBe('text');
  });

  it('typing into the api-key input fires onApiKeyChange, then says the key is saved', async () => {
    const onApiKeyChange = vi.fn(async () => true);
    const { container, rerender, findByText } = render(CloudProviderCard, {
      props: { ...baseProps, onApiKeyChange, settings: settings() },
    });
    await tick();
    const input = container.querySelector('.cp-key-input') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: 'sk-new' } });
    expect(onApiKeyChange).toHaveBeenCalledWith('sk-new');

    await rerender({ apiKey: 'sk-new' });
    expect((await findByText('Key saved')).closest('[role="status"]')).toBeTruthy();
  });

  it('keeps one "Key saved" line while the user keeps typing, so it is announced once', async () => {
    const pending: ((ok: boolean) => void)[] = [];
    const onApiKeyChange = vi.fn(() => new Promise<boolean>((r) => pending.push(r)));
    const { container, rerender } = render(CloudProviderCard, {
      props: { ...baseProps, onApiKeyChange, settings: settings() },
    });
    await tick();
    const input = container.querySelector('.cp-key-input') as HTMLInputElement;
    const status = container.querySelector('[role="status"]') as HTMLElement;
    await fireEvent.input(input, { target: { value: 'sk-a' } });
    pending[0]?.(true);
    await rerender({ apiKey: 'sk-a' });
    await waitFor(() => expect(status.textContent).toContain('Key saved'));
    const line = status.querySelector('.cp-saved');

    await fireEvent.input(input, { target: { value: 'sk-ab' } });
    await tick();
    // The next save is still in flight: the same node stays, so a screen reader hears nothing new.
    expect(status.querySelector('.cp-saved')).toBe(line);
  });

  it('says the key was not saved when the write fails, also after the field loses focus', async () => {
    const onApiKeyChange = vi.fn(async () => false);
    const { container, findByText } = render(CloudProviderCard, {
      props: { ...baseProps, onApiKeyChange, settings: settings() },
    });
    await tick();
    const input = container.querySelector('.cp-key-input') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: 'sk-new' } });
    await fireEvent.blur(input);
    expect(await findByText(/Not saved\. Edit the key to try again\./)).toBeTruthy();
    expect(container.textContent).not.toContain('Key saved');
  });

  it('drops "Key saved" when another window clears the key', async () => {
    const onApiKeyChange = vi.fn(async () => true);
    const { container, rerender, findByText } = render(CloudProviderCard, {
      props: { ...baseProps, onApiKeyChange, settings: settings() },
    });
    await tick();
    const input = container.querySelector('.cp-key-input') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: 'sk-new' } });
    await fireEvent.blur(input);
    await rerender({ apiKey: 'sk-new' });
    expect(await findByText('Key saved')).toBeTruthy();

    await rerender({ apiKey: '' });
    await waitFor(() => expect(container.textContent).not.toContain('Key saved'));
    expect(input.value).toBe('');
  });

  it('says why the model field waits when there is no key', async () => {
    const { findByText } = render(CloudProviderCard, {
      props: { ...baseProps, apiKey: '', settings: settings() },
    });
    expect(await findByText(/Add an API key first/)).toBeTruthy();
  });

  it('clicking refresh on the model combobox populates the list from the provider', async () => {
    setFetchHandler(
      async () =>
        new Response(JSON.stringify({ data: [{ id: 'gpt-4o' }, { id: 'gpt-4o-mini' }] }), {
          status: 200,
        }),
    );
    const { container, getByRole } = render(CloudProviderCard, {
      props: { ...baseProps, settings: settings() },
    });
    await tick();
    const refresh = getByRole('button', { name: /Refresh model list/i });
    await fireEvent.click(refresh);
    await waitFor(() => expect(container.textContent).toMatch(/2 models found/i));
  });

  it('renders a discovery error when the provider 401s', async () => {
    setFetchHandler(async () => new Response('nope', { status: 401, statusText: 'Unauthorized' }));
    const { container, getByRole } = render(CloudProviderCard, {
      props: { ...baseProps, settings: settings() },
    });
    await tick();
    const refresh = getByRole('button', { name: /Refresh model list/i });
    await fireEvent.click(refresh);
    const err = await waitFor(() => {
      const el = container.querySelector('.ega-combobox-error');
      expect(el).not.toBeNull();
      return el;
    });
    // Spec 3.4: a plain line, no status code; a typed model name still works.
    expect(err?.textContent.trim()).toBe(
      'Could not load the model list. Type a model name instead.',
    );
  });

  it('renders the empty-list error when the provider returns no models', async () => {
    setFetchHandler(async () => new Response(JSON.stringify({ data: [] }), { status: 200 }));
    const { container, getByRole } = render(CloudProviderCard, {
      props: { ...baseProps, settings: settings() },
    });
    await tick();
    const refresh = getByRole('button', { name: /Refresh model list/i });
    await fireEvent.click(refresh);
    await waitFor(() =>
      expect(container.querySelector('.ega-combobox-error')?.textContent).toMatch(
        /lists no models/i,
      ),
    );
  });

  it('shows the Get a key link with the supplied URL', async () => {
    const { container } = render(CloudProviderCard, {
      props: { ...baseProps, settings: settings() },
    });
    await tick();
    const link = [...container.querySelectorAll<HTMLAnchorElement>('a.cp-link')].find((a) =>
      a.textContent.includes('Get a key'),
    ) as HTMLAnchorElement;
    expect(link.href).toBe('https://platform.openai.com/api-keys');
    expect(link.target).toBe('_blank');
  });

  it('labels the api-key input with the provider name for screen readers', async () => {
    const { container } = render(CloudProviderCard, {
      props: { ...baseProps, label: 'OpenAI', settings: settings() },
    });
    await tick();
    const input = container.querySelector('.cp-key-input') as HTMLInputElement;
    expect(input.getAttribute('aria-label')).toBe('OpenAI API key');
  });
});
