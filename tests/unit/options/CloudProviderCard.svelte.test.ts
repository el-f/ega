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
  onApiKeyChange: vi.fn(),
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

  it('commits the api key once on change (blur or Enter), not per keystroke, then says so', async () => {
    const onApiKeyChange = vi.fn();
    const { container, rerender, findByText } = render(CloudProviderCard, {
      props: { ...baseProps, onApiKeyChange, settings: settings() },
    });
    await tick();
    const input = container.querySelector('.cp-key-input') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: 'sk-n' } });
    await fireEvent.input(input, { target: { value: 'sk-new' } });
    expect(onApiKeyChange).not.toHaveBeenCalled();

    await fireEvent.change(input);
    expect(onApiKeyChange).toHaveBeenCalledTimes(1);
    expect(onApiKeyChange).toHaveBeenCalledWith('sk-new');

    await rerender({ apiKey: 'sk-new' });
    expect((await findByText('Key saved.')).closest('[role="status"]')).toBeTruthy();
    expect(input.value).toBe('sk-new');
  });

  it('a stored key that changes underneath replaces the field value', async () => {
    const { container, rerender } = render(CloudProviderCard, {
      props: { ...baseProps, settings: settings() },
    });
    const input = container.querySelector('.cp-key-input') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: 'sk-typed' } });
    await rerender({ apiKey: 'sk-imported' });
    expect(input.value).toBe('sk-imported');
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
    await waitFor(() => expect(container.textContent).toMatch(/2 discovered/i));
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
    expect(err?.textContent).toMatch(/Couldn't fetch the model list/i);
    expect(err?.textContent).toMatch(/401/);
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
        /empty model list/i,
      ),
    );
  });

  it('shows the Get key signup link with the supplied URL', async () => {
    const { container } = render(CloudProviderCard, {
      props: { ...baseProps, settings: settings() },
    });
    await tick();
    const link = container.querySelector('a.cp-signup') as HTMLAnchorElement;
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
