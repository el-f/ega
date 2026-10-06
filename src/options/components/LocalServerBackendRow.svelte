<script lang="ts">
  import { DEFAULT_LOCAL_SERVER_URL } from '@/shared/constants';
  import { isLoopbackUrl } from '@/shared/loopback-url';
  import { resolveBackend } from '@/shared/backends/registry';
  import { buildBackendConfig } from '@/shared/backends/build-config';
  import { localServerBaseUrl } from '@/shared/backends/local-server';
  import type { Settings, BackendId } from '@/shared/types';
  import BackendCard from './BackendCard.svelte';
  import ModelCombobox from './ModelCombobox.svelte';
  import BackendStep from './backend-card/BackendStep.svelte';
  import Disclosure from './Disclosure.svelte';

  interface Props {
    id: BackendId;
    label: string;
    settings: Settings;
    onPatch: (next: Partial<Settings>) => void;
    onModelChange: (next: string) => void;
  }

  let { id, label, settings, onPatch, onModelChange }: Props = $props();

  const PRESETS = [
    { name: 'LM Studio', port: '1234', url: 'http://127.0.0.1:1234' },
    { name: 'llama-server', port: '8080', url: 'http://127.0.0.1:8080' },
  ] as const;

  // Holds a half-typed URL under the caret; the sanitized snapshot would otherwise repaint the saved one.
  let urlDraft = $state<string | null>(null);
  let models = $state<string[]>([]);
  let discovering = $state(false);
  let discoverError = $state<string | null>(null);
  /** No answer at the address: shown at the URL field, with the browser's own words under Details. */
  let urlError = $state<{ detail: string } | null>(null);

  const base = $derived(localServerBaseUrl(settings.localServerUrl));

  function pickPreset(url: string): void {
    urlDraft = null;
    onPatch({ localServerUrl: url });
  }

  async function discover(): Promise<void> {
    const backend = resolveBackend(id);
    if (!backend?.discoverModels) return;
    discovering = true;
    discoverError = null;
    urlError = null;
    try {
      models = await backend.discoverModels(buildBackendConfig(settings));
      if (models.length === 0) {
        discoverError = 'The server lists no models. Load or download one, then try again.';
      }
    } catch (e) {
      models = [];
      urlError = { detail: `${base}: ${(e as Error).message}` };
    } finally {
      discovering = false;
    }
  }
</script>

<BackendCard {id} {label} {settings}>
  <BackendStep n={1} title="Address">
    <label class="ls-label" for="be-url-ls">Server URL</label>
    <input
      id="be-url-ls"
      class:field-invalid={urlError !== null}
      data-ega-setting="backends.localServerUrl"
      type="text"
      dir="auto"
      placeholder={DEFAULT_LOCAL_SERVER_URL}
      aria-invalid={urlError !== null}
      aria-describedby={urlError ? 'be-url-ls-error' : 'be-url-ls-hint'}
      value={urlDraft ?? settings.localServerUrl ?? DEFAULT_LOCAL_SERVER_URL}
      oninput={(e) => {
        const v = (e.currentTarget as HTMLInputElement).value;
        // A prefix of a loopback URL fails the schema; the draft holds it until it parses or the field is left.
        urlDraft = v;
        if (v === '' || isLoopbackUrl(v)) onPatch({ localServerUrl: v });
      }}
      onchange={(e) => {
        urlDraft = null;
        onPatch({ localServerUrl: (e.currentTarget as HTMLInputElement).value });
      }}
      onblur={() => (urlDraft = null)}
    />
    <div class="ls-presets">
      {#each PRESETS as p (p.url)}
        <button type="button" aria-pressed={base === p.url} onclick={() => pickPreset(p.url)}>
          {p.name} (:{p.port})
        </button>
      {/each}
    </div>
    {#if urlError}
      <div class="ls-fail">
        <p class="ls-fail-title" id="be-url-ls-error" role="alert">
          No server answered at this address. Check that it is running.
        </p>
        <Disclosure label="Details">
          <p class="ls-line">{urlError.detail}</p>
        </Disclosure>
      </div>
    {:else}
      <p class="ls-line" id="be-url-ls-hint">
        An OpenAI-compatible server on this computer (localhost, 127.0.0.1 or [::1]); Ega sends no
        API key
      </p>
    {/if}
  </BackendStep>

  <BackendStep n={2} title="Model">
    <div class="ls-model-row">
      <ModelCombobox
        value={settings.model.localserver}
        placeholder="The server's first model"
        options={models}
        loading={discovering}
        error={discoverError}
        onValueChange={onModelChange}
        onDiscover={() => void discover()}
      />
    </div>
    {#if models.length > 0}
      <p class="ls-line" role="status">
        Found {models.length} model{models.length === 1 ? '' : 's'}.
      </p>
    {:else if !discoverError && !urlError}
      <p class="ls-line">Start the server, then refresh the list</p>
      <Disclosure label="Show steps">
        <p class="ls-line">
          Turn the server on in LM Studio, or run <code>llama-server -m model.gguf</code> for llama.cpp.
          Then press the refresh button next to the model field.
        </p>
      </Disclosure>
    {/if}
  </BackendStep>
</BackendCard>

<style>
  .ls-label {
    margin: 0;
    font-size: var(--fs-base);
    opacity: 1;
  }
  #be-url-ls {
    max-width: 32rem;
  }
  .ls-line {
    margin: 0;
    max-inline-size: 80ch;
    font-size: var(--fs-base);
    line-height: var(--lh-body);
    color: var(--color-muted);
  }
  .ls-line code {
    font-family: var(--font-mono);
    font-size: var(--fs-sm);
  }
  .ls-fail {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .ls-fail-title {
    margin: 0;
    font-size: var(--fs-base);
    font-weight: 600;
    color: var(--color-danger-fg);
  }
  .ls-model-row {
    max-width: 32rem;
  }
  .ls-presets {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
  }
  .ls-presets > button[aria-pressed='true'] {
    background: var(--color-accent-bg-soft);
    box-shadow: inset 0 0 0 1px var(--color-accent);
  }
</style>
