// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import LocalServerBackendRow from '@/options/components/LocalServerBackendRow.svelte';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { setFetchHandler } from '@tests/mocks/fetch';
import { asBackendIdUnsafe } from '@/shared/brands';
import type { Settings } from '@/shared/types';

function props(over: Partial<Settings> = {}, onPatch = vi.fn(), onModelChange = vi.fn()) {
  return {
    id: asBackendIdUnsafe('localserver'),
    label: 'Local server (OpenAI-compatible)',
    settings: { ...DEFAULT_SETTINGS, ...over },
    disabled: false,
    routeIsText: false,
    routeIsImage: false,
    onPatch,
    onModelChange,
  };
}

/** Every request the card makes, as `METHOD url` plus whether it carried an Authorization header. */
function recordFetches(answer: (url: string) => Response | Promise<Response>): string[] {
  const seen: string[] = [];
  setFetchHandler(async (url, init) => {
    const auth = Object.keys((init?.headers ?? {}) as Record<string, string>).some(
      (h) => h.toLowerCase() === 'authorization',
    );
    seen.push(`${init?.method ?? 'GET'} ${url}${auth ? ' +auth' : ''}`);
    return answer(url);
  });
  return seen;
}

describe('LocalServerBackendRow', () => {
  it('shows the LM Studio address by default, with that preset pressed', () => {
    recordFetches(() => new Response('', { status: 404 }));
    const { getByLabelText, getByRole } = render(LocalServerBackendRow, { props: props() });
    expect((getByLabelText('Server URL') as HTMLInputElement).value).toBe('http://127.0.0.1:1234');
    expect(getByRole('button', { name: 'LM Studio (:1234)' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(getByRole('button', { name: 'llama-server (:8080)' }).getAttribute('aria-pressed')).toBe(
      'false',
    );
  });

  it('a preset writes its URL', async () => {
    recordFetches(() => new Response('', { status: 404 }));
    const onPatch = vi.fn();
    const { getByRole } = render(LocalServerBackendRow, { props: props({}, onPatch) });
    await fireEvent.click(getByRole('button', { name: 'llama-server (:8080)' }));
    expect(onPatch).toHaveBeenCalledWith({ localServerUrl: 'http://127.0.0.1:8080' });
  });

  it('marks the preset that matches the saved URL, /v1 and all', () => {
    recordFetches(() => new Response('', { status: 404 }));
    const { getByRole } = render(LocalServerBackendRow, {
      props: props({ localServerUrl: 'http://127.0.0.1:8080/v1' }),
    });
    expect(getByRole('button', { name: 'llama-server (:8080)' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
  });

  it('saves a loopback URL as it is typed, and holds a non-loopback one back', async () => {
    recordFetches(() => new Response('', { status: 404 }));
    const onPatch = vi.fn();
    const { getByLabelText } = render(LocalServerBackendRow, { props: props({}, onPatch) });
    const input = getByLabelText('Server URL') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: 'http://192.168.1.5:1234' } });
    expect(onPatch).not.toHaveBeenCalled();
    await fireEvent.input(input, { target: { value: 'http://localhost:8080' } });
    expect(onPatch).toHaveBeenCalledWith({ localServerUrl: 'http://localhost:8080' });
  });

  it('refresh lists the server models from /v1/models with no API key', async () => {
    const seen = recordFetches((url) =>
      url.endsWith('/v1/models')
        ? Response.json({ data: [{ id: 'qwen3-8b' }, { id: 'text-embedding-nomic' }] })
        : new Response('', { status: 404 }),
    );
    const { getByRole, findByText } = render(LocalServerBackendRow, {
      props: props({ localServerUrl: 'http://127.0.0.1:8080' }),
    });
    await fireEvent.click(getByRole('button', { name: 'Refresh model list from the backend' }));
    await findByText('Found 1 model.');
    expect(seen).toContain('GET http://127.0.0.1:8080/v1/models');
    expect(seen.some((s) => s.endsWith('+auth'))).toBe(false);
  });

  it('a refresh that cannot reach the server names the address and says to start it', async () => {
    recordFetches(() => {
      throw new TypeError('Failed to fetch');
    });
    const { getByRole, findByText } = render(LocalServerBackendRow, {
      props: props({ localServerUrl: 'http://localhost:8080' }),
    });
    await fireEvent.click(getByRole('button', { name: 'Refresh model list from the backend' }));
    await findByText(/Cannot list the models at http:\/\/localhost:8080 .*Start the server/);
  });

  it('Test now on a stopped server shows the request error, not the generic probe sentence', async () => {
    recordFetches(() => {
      throw new TypeError('Failed to fetch');
    });
    const { getByTestId } = render(LocalServerBackendRow, { props: props() });
    await fireEvent.click(getByTestId('backend-card-test-localserver'));
    await waitFor(() => {
      expect(document.body.textContent).toContain(
        'Cannot reach the local server at http://127.0.0.1:1234. Start the server',
      );
    });
    expect(document.body.textContent).not.toContain('Cannot reach this backend.');
  });
});
