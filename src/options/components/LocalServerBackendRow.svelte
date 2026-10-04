<script lang="ts">
  import { DEFAULT_LOCAL_SERVER_URL } from '@/shared/constants';
  import { isLoopbackUrl } from '@/shared/loopback-url';
  import { resolveBackend } from '@/shared/backends/registry';
  import { buildBackendConfig } from '@/shared/backends/build-config';
  import { localServerBaseUrl } from '@/shared/backends/local-server';
  import type { Settings, BackendId } from '@/shared/types';
  import BackendCard from './BackendCard.svelte';
  import ModelCombobox from './ModelCombobox.svelte';

  interface Props {
    id: BackendId;
    label: string;
    settings: Settings;
    routeIsText: boolean;
    routeIsImage: boolean;
    onPatch: (next: Partial<Settings>) => void;
    onModelChange: (next: string) => void;
  }

  let { id, label, settings, routeIsText, routeIsImage, onPatch, onModelChange }: Props = $props();

  const PRESETS = [
    { name: 'LM Studio', port: '1234', url: 'http://127.0.0.1:1234' },
    { name: 'llama-server', port: '8080', url: 'http://127.0.0.1:8080' },
  ] as const;

  // Holds a half-typed URL under the caret; the sanitized snapshot would otherwise repaint the saved one.
  let urlDraft = $state<string | null>(null);
  let models = $state<string[]>([]);
  let discovering = $state(false);
  let discoverError = $state<string | null>(null);

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
    try {
      models = await backend.discoverModels(buildBackendConfig(settings));
      if (models.length === 0) {
        discoverError = 'The server lists no models. Load or download one, then try again.';
      }
    } catch (e) {
      models = [];
      discoverError = `Cannot list the models at ${base} (${(e as Error).message}). Start the server, then try again.`;
    } finally {
      discovering = false;
    }
  }
</script>

<BackendCard {id} {label} {settings} {routeIsText} {routeIsImage}>
  <div class="ls-panel">
    <section class="ls-step">
      <div class="ls-step-head">
        <span class="ls-step-num">1</span>
        <div>
          <b>Connection</b>
          <small>Where Ega reaches the server on this computer.</small>
        </div>
      </div>
      <label for="be-url-ls">Server URL</label>
      <input
        id="be-url-ls"
        type="text"
        dir="auto"
        placeholder={DEFAULT_LOCAL_SERVER_URL}
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
      <div class="row ls-presets">
        {#each PRESETS as p (p.url)}
          <button type="button" aria-pressed={base === p.url} onclick={() => pickPreset(p.url)}>
            {p.name} (:{p.port})
          </button>
        {/each}
      </div>
      <div class="help">
        Ega calls <code>/v1/models</code> and <code>/v1/chat/completions</code> at this address and
        sends no API key. Only this computer's addresses work: <code>localhost</code>,
        <code>127.0.0.1</code> and <code>[::1]</code>.
      </div>
    </section>

    <section class="ls-step">
      <div class="ls-step-head">
        <span class="ls-step-num">2</span>
        <div>
          <b>Model</b>
          <small>Leave it empty to use the first model the server lists.</small>
        </div>
      </div>
      <ModelCombobox
        value={settings.model.localserver}
        placeholder="The server's first model"
        options={models}
        loading={discovering}
        error={discoverError}
        onValueChange={onModelChange}
        onDiscover={() => void discover()}
      />
      {#if !discoverError}
        <div class="help">
          {#if models.length > 0}
            Found {models.length} model{models.length === 1 ? '' : 's'}.
          {:else}
            Start the server first: turn it on in LM Studio, or run
            <code>llama-server -m model.gguf</code>. Then press refresh to list its models.
          {/if}
        </div>
      {/if}
    </section>
  </div>
</BackendCard>

<style>
  .ls-panel {
    display: grid;
    gap: var(--space-3);
  }
  .ls-step {
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-md);
    background: var(--color-bg-elevated);
    padding: var(--space-3);
  }
  .ls-step-head {
    display: flex;
    align-items: flex-start;
    gap: var(--space-2);
    margin-bottom: var(--space-1);
  }
  .ls-step-head b {
    display: block;
    font-size: var(--fs-sm);
    color: var(--color-fg);
  }
  .ls-step-head small {
    display: block;
    font-size: var(--fs-xs);
    color: var(--color-muted);
  }
  .ls-step-num {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    border-radius: var(--radius-pill);
    background: var(--color-accent-bg-soft);
    color: var(--color-accent-soft);
    font-size: var(--fs-xs);
    font-weight: 700;
    flex: 0 0 22px;
  }
  .ls-presets {
    gap: var(--space-1);
    margin-top: var(--space-1);
  }
  .ls-presets > button[aria-pressed='true'] {
    border-color: var(--color-accent);
    color: var(--color-accent);
  }
</style>
