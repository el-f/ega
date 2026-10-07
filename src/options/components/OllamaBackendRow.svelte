<script lang="ts">
  import { debugCatch } from '@/shared/logger';
  import { DEFAULT_LOCAL_BACKEND_TIMEOUT_MS, DEFAULT_OLLAMA_URL } from '@/shared/constants';
  import { isLoopbackUrl } from '@/shared/loopback-url';
  import { resolveModelId } from '@/shared/settings-schema';
  import type { Settings, BackendId } from '@/shared/types';
  import BackendCard from './BackendCard.svelte';
  import Select from '@/shared/ui/Select.svelte';
  import Input from '@/shared/ui/Input.svelte';
  import BackendStep from './backend-card/BackendStep.svelte';
  import Button from '@/shared/ui/Button.svelte';
  import OllamaOriginSteps from './backend-card/OllamaOriginSteps.svelte';
  import Disclosure from './Disclosure.svelte';
  import InlineSpinner from './InlineSpinner.svelte';
  import {
    isOllamaCloudName,
    ollamaModelLabel,
    parseOllamaTags,
    type OllamaTagRow,
  } from '@/shared/backends/ollama-show';

  interface Props {
    id: BackendId;
    label: string;
    settings: Settings;
    onPatch: (next: Partial<Settings>) => void;
    onModelChange: (next: string) => void;
  }

  let { id, label, settings, onPatch, onModelChange }: Props = $props();

  const extId = chrome.runtime.id;
  const ollamaOrigin = `chrome-extension://${extId}`;

  let ollamaDiscovering = $state(false);
  let ollamaDiscovered: OllamaTagRow[] | null = $state(null);
  let ollamaError: string | null = $state(null);
  /** No answer at the address: shown at the URL field, with the browser's own words under Details. */
  let urlError: { detail: string } | null = $state(null);
  /** Ollama answered the model list but refused Ega's origin on /api/chat. */
  let ollamaBlocked = $state(false);
  // Holds a half-typed URL under the caret; the sanitized snapshot would otherwise repaint the default.
  let urlDraft = $state<string | null>(null);

  async function discoverOllamaModels(url: string): Promise<void> {
    const base = (url || DEFAULT_OLLAMA_URL).trim().replace(/\/+$/, '');
    const timeoutMs = Math.max(
      settings.localBackendTimeoutMs ?? DEFAULT_LOCAL_BACKEND_TIMEOUT_MS,
      5000,
    );
    ollamaDiscovering = true;
    ollamaError = null;
    urlError = null;
    ollamaBlocked = false;
    try {
      const res = await fetch(`${base}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) {
        ollamaError = `Ollama answered ${res.status}${res.statusText ? ` ${res.statusText}` : ''}. Check that the address points at Ollama.`;
        return;
      }
      ollamaDiscovered = parseOllamaTags(await res.json());

      // /api/tags is lenient on CORS and /api/chat is strict, so tags-ok plus chat-403 means the origin is not allow-listed.
      try {
        const preflight = await fetch(`${base}/api/chat`, {
          method: 'OPTIONS',
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (preflight.status === 403) ollamaBlocked = true;
      } catch (e) {
        debugCatch(e, 'options.components.OllamaBackendRow.1');
      }
    } catch (e) {
      const msg = (e as Error).message ?? 'unknown error';
      const timedOut =
        (e instanceof DOMException && e.name === 'TimeoutError') || /timed out|timeout/i.test(msg);
      urlError = {
        detail: timedOut ? `No answer from ${base} within ${timeoutMs} ms.` : `${base}: ${msg}`,
      };
    } finally {
      ollamaDiscovering = false;
    }
  }
</script>

<BackendCard {id} {label} {settings}>
  <BackendStep n={1} title="Address">
    <label class="ol-label" for="be-url-ol">Ollama URL</label>
    <input
      id="be-url-ol"
      class:field-invalid={urlError !== null}
      data-ega-setting="backends.ollamaUrl"
      type="text"
      dir="auto"
      placeholder={DEFAULT_OLLAMA_URL}
      aria-invalid={urlError !== null}
      aria-describedby={urlError ? 'be-url-ol-error' : 'be-url-ol-hint'}
      value={urlDraft ?? settings.ollamaUrl ?? DEFAULT_OLLAMA_URL}
      oninput={(e) => {
        const v = (e.currentTarget as HTMLInputElement).value;
        // A prefix of a loopback URL fails the schema; the draft holds it under the caret until it parses or the field is left.
        urlDraft = v;
        if (v === '' || isLoopbackUrl(v)) onPatch(v ? { ollamaUrl: v } : { ollamaUrl: '' });
      }}
      onchange={(e) => {
        const v = (e.currentTarget as HTMLInputElement).value;
        urlDraft = null;
        onPatch(v ? { ollamaUrl: v } : { ollamaUrl: '' });
      }}
      onblur={() => (urlDraft = null)}
    />
    {#if urlError}
      <div class="ol-fail">
        <p class="ol-fail-title" id="be-url-ol-error" role="alert">
          Ollama did not answer at this address. Check that it is running.
        </p>
        <Disclosure label="Details">
          <p class="ol-line">{urlError.detail}</p>
        </Disclosure>
      </div>
    {:else}
      <p class="ol-line" id="be-url-ol-hint">
        Only this computer's addresses work: localhost, 127.0.0.1 or [::1]
      </p>
    {/if}
  </BackendStep>

  <BackendStep n={2} title="Model">
    <div class="ol-model-row">
      {#if ollamaDiscovered && ollamaDiscovered.length > 0}
        {@const opts = [
          ...ollamaDiscovered.map((r) => ({ value: r.name, label: ollamaModelLabel(r) })),
          ...(ollamaDiscovered.some((r) => r.name === settings.model.ollama)
            ? []
            : [
                {
                  value: settings.model.ollama,
                  label: isOllamaCloudName(settings.model.ollama)
                    ? `${settings.model.ollama} (cloud)`
                    : `${settings.model.ollama} (not pulled locally)`,
                },
              ]),
        ]}
        <Select
          size="sm"
          ariaLabel="Ollama model"
          value={settings.model.ollama}
          options={opts}
          onchange={(v) => onModelChange(v)}
        />
      {:else}
        <Input
          ariaLabel="Ollama model"
          value={settings.model.ollama}
          oninput={(e) => onModelChange((e.currentTarget as HTMLInputElement).value)}
        />
      {/if}
      <!-- Like Test now: the shared `loading` hides the label and drops focus. -->
      <Button
        variant="secondary"
        ariaDisabled={ollamaDiscovering}
        onclick={() => void discoverOllamaModels(settings.ollamaUrl ?? DEFAULT_OLLAMA_URL)}
        >{#if ollamaDiscovering}<InlineSpinner />Discovering...{:else}Discover models{/if}</Button
      >
    </div>
    {#if isOllamaCloudName(settings.model.ollama) || ollamaDiscovered?.some((r) => r.cloud && r.name === settings.model.ollama)}
      <p class="ol-line">
        This is an Ollama cloud model: it runs on ollama.com, so your text leaves this computer
      </p>
    {/if}
    {#if ollamaBlocked}
      <div class="ol-fail">
        <p class="ol-fail-title" role="alert">Ollama blocked the request from Ega</p>
        <Disclosure label="Show steps">
          <OllamaOriginSteps origin={ollamaOrigin} />
        </Disclosure>
      </div>
    {:else if ollamaError}
      <p class="ol-line ol-danger" role="alert">{ollamaError}</p>
    {:else if ollamaDiscovered && ollamaDiscovered.length === 0}
      <p class="ol-line">
        Connected, but no models are pulled yet. Run
        <code>ollama pull {resolveModelId(settings.model, 'ollama')}</code>, then discover again.
      </p>
    {:else if ollamaDiscovered && ollamaDiscovered.length > 0}
      {@const cloud = ollamaDiscovered.filter((r) => r.cloud).length}
      {@const local = ollamaDiscovered.length - cloud}
      <p class="ol-line" role="status">
        Found {local} local model{local === 1 ? '' : 's'}{cloud > 0
          ? ` and ${cloud} cloud model${cloud === 1 ? '' : 's'}`
          : ''}.
      </p>
    {:else if !urlError}
      <p class="ol-line">
        Install from
        <a href="https://ollama.com/download" target="_blank" rel="noopener noreferrer"
          >ollama.com</a
        >, run <code>ollama serve</code>, then pull a model.
      </p>
    {/if}
  </BackendStep>
</BackendCard>

<style>
  .ol-label {
    margin: 0;
    font-size: var(--fs-base);
    opacity: 1;
  }
  #be-url-ol {
    max-width: 32rem;
  }
  .ol-line {
    margin: 0;
    max-inline-size: 80ch;
    font-size: var(--fs-base);
    line-height: var(--lh-body);
    color: var(--color-muted);
  }
  .ol-line code {
    font-family: var(--font-mono);
    font-size: var(--fs-sm);
  }
  .ol-danger {
    color: var(--color-danger-fg);
  }
  .ol-fail {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .ol-fail-title {
    margin: 0;
    font-size: var(--fs-base);
    font-weight: 600;
    color: var(--color-danger-fg);
  }
  .ol-model-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    max-width: 32rem;
  }
  .ol-model-row > :global(:first-child) {
    flex: 1 1 auto;
    min-width: 0;
  }
</style>
