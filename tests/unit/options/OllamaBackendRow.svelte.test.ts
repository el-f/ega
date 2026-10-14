// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import OllamaBackendRow from '@/options/components/OllamaBackendRow.svelte';
import OllamaOriginSteps from '@/options/components/backend-card/OllamaOriginSteps.svelte';
import { DEFAULT_MODEL, DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { setFetchHandler } from '@tests/mocks/fetch';
import { asBackendIdUnsafe } from '@/shared/brands';

describe('OllamaBackendRow', () => {
  it('shows two numbered steps, Address and Model, with the Discover models button', () => {
    const { container, getByRole } = render(OllamaBackendRow, {
      props: {
        id: asBackendIdUnsafe('ollama'),
        label: 'Ollama (local)',
        settings: DEFAULT_SETTINGS,
        onPatch: () => {},
        onModelChange: () => {},
      },
    });
    expect(getByRole('heading', { level: 3, name: 'Address' })).toBeTruthy();
    expect(getByRole('heading', { level: 3, name: 'Model' })).toBeTruthy();
    // Discover models button is the user-facing affordance.
    const discoverBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent.trim() === 'Discover models',
    );
    expect(discoverBtn).toBeDefined();
    expect(discoverBtn?.disabled).toBe(false);
    // The OLLAMA_ORIGINS steps show only once Ollama has blocked Ega.
    expect(container.querySelector('[data-ega-ollama-origin-steps]')).toBeNull();
  });

  it('a model list that Ollama answers but /api/chat refuses says Ollama blocked Ega, steps behind Show steps', async () => {
    setFetchHandler(async (_url, init) =>
      init?.method === 'OPTIONS'
        ? new Response(null, { status: 403 })
        : Response.json({ models: [{ name: 'gemma4:e4b' }] }),
    );
    const { getByRole, findByRole } = render(OllamaBackendRow, {
      props: {
        id: asBackendIdUnsafe('ollama'),
        label: 'Ollama (local)',
        settings: DEFAULT_SETTINGS,
        onPatch: () => {},
        onModelChange: () => {},
      },
    });
    await fireEvent.click(getByRole('button', { name: 'Discover models' }));
    const alert = await findByRole('alert');
    expect(alert.textContent.trim()).toBe('Ollama blocked the request from Ega');
    const steps = alert.parentElement?.querySelector('details');
    expect(steps?.querySelector('summary')?.textContent.trim()).toBe('Show steps');
    expect(steps?.querySelector('[data-ega-ollama-origin-steps]')?.textContent).toContain(
      'chrome-extension://',
    );
  });

  it('no answer at the address marks the URL field and keeps the browser words under Details', async () => {
    setFetchHandler(async () => {
      throw new TypeError('Failed to fetch');
    });
    const { getByRole, getByLabelText, findByRole } = render(OllamaBackendRow, {
      props: {
        id: asBackendIdUnsafe('ollama'),
        label: 'Ollama (local)',
        settings: DEFAULT_SETTINGS,
        onPatch: () => {},
        onModelChange: () => {},
      },
    });
    await fireEvent.click(getByRole('button', { name: 'Discover models' }));
    const alert = await findByRole('alert');
    expect(alert.textContent.trim()).toBe(
      'Ollama did not answer at this address. Check that it is running.',
    );
    const url = getByLabelText('Ollama URL');
    expect(url.getAttribute('aria-invalid')).toBe('true');
    expect(url.getAttribute('aria-describedby')).toBe(alert.id);
    expect(alert.parentElement?.querySelector('details')?.textContent).toContain('Failed to fetch');
  });

  it.each(['gemma4:cloud', 'gpt-oss:120b-cloud'])(
    'says a cloud model (%s) sends text to ollama.com',
    (model) => {
      const { getByText } = render(OllamaBackendRow, {
        props: {
          id: asBackendIdUnsafe('ollama'),
          label: 'Ollama (local)',
          settings: { ...DEFAULT_SETTINGS, model: { ...DEFAULT_SETTINGS.model, ollama: model } },
          onPatch: () => {},
          onModelChange: () => {},
        },
      });
      expect(getByText(/runs on ollama\.com/)).toBeTruthy();
    },
  );

  it('says nothing about the cloud for a local model', () => {
    const { queryByText } = render(OllamaBackendRow, {
      props: {
        id: asBackendIdUnsafe('ollama'),
        label: 'Ollama (local)',
        settings: DEFAULT_SETTINGS,
        onPatch: () => {},
        onModelChange: () => {},
      },
    });
    expect(queryByText(/runs on ollama\.com/)).toBeNull();
  });

  it('tells a daemon with no models to pull the default model', async () => {
    setFetchHandler(async () => new Response('{"models":[]}', { status: 200 }));
    const { getByRole, findByText } = render(OllamaBackendRow, {
      props: {
        id: asBackendIdUnsafe('ollama'),
        label: 'Ollama (local)',
        settings: DEFAULT_SETTINGS,
        onPatch: () => {},
        onModelChange: () => {},
      },
    });
    await fireEvent.click(getByRole('button', { name: 'Discover models' }));
    expect((await findByText(`ollama pull ${DEFAULT_MODEL.ollama}`)).tagName).toBe('CODE');
    expect(DEFAULT_MODEL.ollama).toBe('gemma4:e4b');
  });
});

describe('the empty-state pull hint', () => {
  it('names the model that will run, not the default, when a row still holds an older pick', async () => {
    setFetchHandler(async () => new Response('{"models":[]}', { status: 200 }));
    const settings = {
      ...DEFAULT_SETTINGS,
      model: { ...DEFAULT_SETTINGS.model, ollama: 'llama3.2' },
    };
    const { getByRole, findByText } = render(OllamaBackendRow, {
      props: {
        id: asBackendIdUnsafe('ollama'),
        label: 'Ollama (local)',
        settings,
        onPatch: () => {},
        onModelChange: () => {},
      },
    });
    await fireEvent.click(getByRole('button', { name: 'Discover models' }));
    expect((await findByText('ollama pull llama3.2')).tagName).toBe('CODE');
  });
});

describe('the discovered model list', () => {
  const props = (ollama: string) => ({
    id: asBackendIdUnsafe('ollama'),
    label: 'Ollama (local)',
    settings: { ...DEFAULT_SETTINGS, model: { ...DEFAULT_SETTINGS.model, ollama } },
    onPatch: () => {},
    onModelChange: () => {},
  });
  const tags = {
    models: [
      { name: 'gemma4:e4b', capabilities: ['completion', 'vision', 'thinking'] },
      { name: 'llama3.2:3b', capabilities: ['completion', 'tools'] },
      { name: 'gpt-oss:120b', remote_host: 'https://ollama.com:443', capabilities: ['thinking'] },
    ],
  };

  it('labels each model with what it can do, as Ollama tags it', async () => {
    setFetchHandler(async () => Response.json(tags));
    const { getByRole, findByRole } = render(OllamaBackendRow, { props: props('gemma4:e4b') });
    await fireEvent.click(getByRole('button', { name: 'Discover models' }));
    await findByRole('option', { name: 'gemma4:e4b (vision, thinking)', hidden: true });
    expect(getByRole('option', { name: 'llama3.2:3b', hidden: true })).toBeTruthy();
    expect(
      getByRole('option', { name: 'gpt-oss:120b (cloud, thinking)', hidden: true }),
    ).toBeTruthy();
  });

  it('names the picker for screen readers and counts cloud rows apart', async () => {
    setFetchHandler(async () => Response.json(tags));
    const { getByRole, findByRole, getByText } = render(OllamaBackendRow, {
      props: props('kimi-k2:1t-cloud'),
    });
    await fireEvent.click(getByRole('button', { name: 'Discover models' }));
    await findByRole('combobox', { name: 'Ollama model' });
    expect(getByRole('option', { name: 'kimi-k2:1t-cloud (cloud)', hidden: true })).toBeTruthy();
    expect(getByText(/Found 2 local models and 1 cloud model\./)).toBeTruthy();
  });

  it('warns about ollama.com for a cloud model whose name does not say cloud', async () => {
    setFetchHandler(async () => Response.json(tags));
    const { getByRole, findByText } = render(OllamaBackendRow, { props: props('gpt-oss:120b') });
    await fireEvent.click(getByRole('button', { name: 'Discover models' }));
    expect(await findByText(/runs on ollama\.com/)).toBeTruthy();
  });
});

describe('the Linux OLLAMA_ORIGINS steps', () => {
  it('gives the whole systemd edit, not only the Environment line', () => {
    const { container } = render(OllamaOriginSteps, {
      props: { origin: 'chrome-extension://abc' },
    });
    const linux = [...container.querySelectorAll('dt')].find((d) =>
      d.textContent.includes('Linux'),
    )?.nextElementSibling;
    const text = linux?.textContent ?? '';
    expect(text).toContain('sudo systemctl edit ollama.service');
    expect(text).toContain('[Service]');
    expect(text).toMatch(/Environment="OLLAMA_ORIGINS=chrome-extension:\/\//);
    expect(text).toContain('sudo systemctl daemon-reload && sudo systemctl restart ollama');
  });
});
