<script lang="ts">
  import { resolveBackend } from '@/shared/backends/registry';
  import type { BackendConfig } from '@/shared/backends/base';
  import type { Settings, BackendId } from '@/shared/types';
  import IconButton from '@/shared/ui/IconButton.svelte';
  import Eye from '@lucide/svelte/icons/eye';
  import EyeOff from '@lucide/svelte/icons/eye-off';
  import ExternalLink from '@lucide/svelte/icons/external-link';
  import BackendCard from './BackendCard.svelte';
  import ModelCombobox from './ModelCombobox.svelte';
  import ResetField from '@/shared/ui/ResetField.svelte';
  import Badge from '@/shared/ui/Badge.svelte';
  import BackendStep from './backend-card/BackendStep.svelte';
  import { DEFAULT_MODEL } from '@/shared/settings-schema';
  import { relativeTime } from '@/shared/relative-time';

  interface Props {
    id: BackendId;
    label: string;
    settings: Settings;
    apiKey: string;
    model: string;
    /** External signup / dashboard URL where the user can mint a key. */
    signupUrl: string;
    /** Friendly key-shape hint for the placeholder ("sk-…"). */
    keyPlaceholder?: string;
    /** Wall-clock ms when this key was last edited. Absent for older keys. */
    editedAt?: number | undefined;
    disabled: boolean;
    /** Saves the key; resolves false when the write did not land. */
    onApiKeyChange: (next: string) => Promise<boolean>;
    onModelChange: (next: string) => void;
  }

  let {
    id,
    label,
    settings,
    apiKey,
    model,
    signupUrl,
    keyPlaceholder,
    editedAt,
    disabled,
    onApiKeyChange,
    onModelChange,
  }: Props = $props();

  const editedAgo = $derived(
    typeof editedAt === 'number' ? relativeTime(editedAt, Date.now()) : null,
  );
  // While the field has focus the typed text wins over a settings snapshot that lands under the caret.
  let keyDraft = $state<string | null>(null);
  // Each edit saves at once, so Test now right after a paste runs with the new key.
  // Set only when the latest save settles: the status line then changes once, not on every keystroke.
  let keySave = $state<'idle' | 'saved' | 'removed' | 'failed'>('idle');
  let keySaveGen = 0;
  let keySettledGen = 0;
  let keySavedValue = '';
  function saveKey(v: string): void {
    const gen = ++keySaveGen;
    void onApiKeyChange(v).then((ok) => {
      if (gen !== keySaveGen) return;
      keySettledGen = gen;
      keySavedValue = v;
      keySave = !ok ? 'failed' : v.trim() ? 'saved' : 'removed';
    });
  }
  // Another window can change the key; the line about this page's last save would then sit over a value it never wrote.
  $effect(() => {
    const k = apiKey;
    if (keySettledGen === keySaveGen && k.trim() !== keySavedValue.trim()) keySave = 'idle';
  });

  import { onMount } from 'svelte';
  import {
    readDiscoveryCache,
    writeDiscoveryCache,
    invalidateDiscoveryCache,
  } from '@/shared/discovery-cache';

  let keyVisible = $state(false);
  let discoveredModels = $state<string[]>([]);
  let discoverLoading = $state(false);
  let discoverError = $state<string | null>(null);

  // An id outside DEFAULT_MODEL (a test stub) yields undefined and hides the reset arrow.
  const defaultModelId = $derived(
    DEFAULT_MODEL[id as keyof typeof DEFAULT_MODEL] as string | undefined,
  );

  onMount(() => {
    if (!apiKey) return;
    void readDiscoveryCache(id, apiKey).then((cached) => {
      if (cached && cached.length > 0 && discoveredModels.length === 0) {
        discoveredModels = cached;
      }
    });
  });

  function buildConfigForDiscover(): BackendConfig {
    // discoverModels reads only `apiKeys[id]`; the rest fills the shared BackendConfig shape.
    const apiKeys: BackendConfig['apiKeys'] = {
      [id as keyof BackendConfig['apiKeys']]: apiKey,
    };
    return {
      apiKeys,
      model: settings.model,
      advanced: {
        temperature: settings.advanced.temperature,
        maxTokens: settings.advanced.maxTokens,
      },
    };
  }

  async function refreshModels(): Promise<void> {
    const backend = resolveBackend(id);
    if (!backend?.discoverModels) {
      discoverError = 'This backend cannot list its models. Type a model name instead.';
      return;
    }
    discoverLoading = true;
    discoverError = null;
    // Refresh = explicit user intent for fresh data; bypass cache.
    void invalidateDiscoveryCache(id);
    try {
      const list = await backend.discoverModels(buildConfigForDiscover());
      discoveredModels = list;
      if (list.length === 0) {
        discoverError = `${label} lists no models. Type a model name instead.`;
      } else if (apiKey) {
        void writeDiscoveryCache(id, apiKey, list);
      }
    } catch {
      discoverError = 'Could not load the model list. Type a model name instead.';
      discoveredModels = [];
    } finally {
      discoverLoading = false;
    }
  }
</script>

<BackendCard {id} {label} {settings}>
  <BackendStep n={1} title="API key">
    {#if id === 'gemini'}
      <p class="cp-line">A free key takes about a minute at Google AI Studio</p>
    {/if}
    <div class="cp-links">
      <a class="cp-link" href={signupUrl} target="_blank" rel="noopener noreferrer">
        Get a key <ExternalLink size={14} aria-hidden="true" />
      </a>
      {#if id === 'gemini'}
        <a
          class="cp-link"
          href="https://ai.google.dev/gemini-api/terms"
          target="_blank"
          rel="noopener noreferrer"
        >
          Google's terms <ExternalLink size={14} aria-hidden="true" />
        </a>
      {/if}
    </div>
    <label class="cp-label" for="cp-key-{id}">API key</label>
    <div class="cp-key-row">
      <input
        id="cp-key-{id}"
        class="cp-key-input"
        type={keyVisible ? 'text' : 'password'}
        dir="auto"
        data-ega-api-key={id}
        aria-label="{label} API key"
        autocomplete="off"
        spellcheck="false"
        placeholder={keyPlaceholder ?? 'Paste the key here'}
        value={keyDraft ?? apiKey}
        oninput={(e) => {
          const v = (e.currentTarget as HTMLInputElement).value;
          keyDraft = v;
          saveKey(v);
        }}
        onblur={() => (keyDraft = null)}
      />
      <IconButton
        icon={keyVisible ? EyeOff : Eye}
        ariaLabel={keyVisible ? 'Hide API key' : 'Show API key'}
        size="sm"
        onclick={() => (keyVisible = !keyVisible)}
      />
    </div>
    <div class="cp-key-meta" role="status">
      {#if keySave === 'failed'}
        <span class="cp-save-failed">Not saved. Edit the key to try again.</span>
      {:else if keySave !== 'idle'}
        <span class="cp-saved">{keySave === 'saved' ? 'Key saved' : 'Key removed'}</span>
      {/if}
      {#if apiKey && editedAgo}
        <span class="cp-edited">Edited {editedAgo}</span>
      {/if}
    </div>
  </BackendStep>

  <BackendStep n={2} title="Model">
    {#if disabled}
      <p class="cp-line" id="cp-model-why-{id}" data-ega-disabled-reason>
        Enable this backend to pick a model
      </p>
    {:else if !apiKey}
      <p class="cp-line" id="cp-model-why-{id}" data-ega-disabled-reason>
        Add an API key first; the model list comes from {label}
      </p>
    {/if}
    {#if discoveredModels.length > 0}
      <p class="cp-line" role="status">{discoveredModels.length} models found</p>
    {/if}
    <div class="cp-model-row">
      <ModelCombobox
        value={model || (defaultModelId ?? '')}
        options={discoveredModels}
        loading={discoverLoading}
        error={discoverError}
        disabled={disabled || !apiKey}
        onValueChange={onModelChange}
        onDiscover={() => void refreshModels()}
      />
      {#if defaultModelId !== undefined && (model === '' || model === defaultModelId)}
        <Badge variant="muted">Default</Badge>
      {:else if defaultModelId !== undefined}
        <ResetField
          differsFromInherited={true}
          onReset={() => onModelChange(defaultModelId)}
          ariaLabel="Use the default model"
          inheritedLabel={`Default ${defaultModelId}`}
        />
      {/if}
    </div>
  </BackendStep>
</BackendCard>

<style>
  .cp-line {
    margin: 0;
    font-size: var(--fs-base);
    line-height: var(--lh-body);
    color: var(--color-muted);
  }
  .cp-links {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
  }
  .cp-link {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    min-height: 24px;
    color: var(--color-accent-hover);
    font-size: var(--fs-base);
  }
  .cp-link:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
    border-radius: var(--radius-sm);
  }
  .cp-label {
    font-size: var(--fs-base);
  }
  .cp-key-row {
    display: flex;
    align-items: stretch;
    gap: var(--space-1);
    max-width: 32rem;
    background: var(--color-bg);
    border: 1px solid var(--color-control-border);
    border-radius: var(--radius-sm);
    padding: 2px;
    transition: border-color var(--motion-fast) var(--ease-out);
  }
  .cp-key-row:focus-within {
    border-color: var(--color-accent);
  }
  .cp-key-input {
    flex: 1 1 auto;
    min-height: 28px;
    border: 0;
    outline: none;
    background: transparent;
    color: var(--color-fg);
    font-family: var(--font-mono);
    font-size: var(--fs-sm);
    padding: 0 var(--space-2);
    caret-color: var(--color-accent);
  }
  .cp-key-input::placeholder {
    color: var(--color-muted);
    font-family: var(--font-ui);
  }
  .cp-key-meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--fs-base);
    color: var(--color-muted);
  }
  .cp-edited {
    font-variant-numeric: tabular-nums;
  }
  .cp-saved {
    color: var(--color-success-fg);
  }
  .cp-save-failed {
    color: var(--color-danger-fg);
  }
  /* Baseline: a model list error under the field must not pull the Default pill down. */
  .cp-model-row {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
    max-width: 32rem;
  }
  .cp-model-row > :global(:first-child) {
    flex: 1 1 auto;
    min-width: 0;
  }
</style>
