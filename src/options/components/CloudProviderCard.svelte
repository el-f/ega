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
    onApiKeyChange: (next: string) => void;
    onModelChange: (next: string) => void;
    /** Passed through to BackendCard for resolved-route markers. */
    routeIsText?: boolean;
    /** Passed through to BackendCard for resolved-route markers. */
    routeIsImage?: boolean;
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
    routeIsText = false,
    routeIsImage = false,
  }: Props = $props();

  const editedAgo = $derived(
    typeof editedAt === 'number' ? relativeTime(editedAt, Date.now()) : null,
  );
  // While the field has focus the typed text wins over a settings snapshot that lands under the caret.
  let keyDraft = $state<string | null>(null);
  // Each edit saves at once, so Test now right after a paste runs with the new key.
  let keySaved = $state(false);

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
      discoverError = 'This backend cannot list its models yet. Type a model id instead.';
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
        discoverError = 'The backend returned an empty model list.';
      } else if (apiKey) {
        void writeDiscoveryCache(id, apiKey, list);
      }
    } catch (e) {
      discoverError = `Couldn't fetch the model list: ${(e as Error).message}`;
      discoveredModels = [];
    } finally {
      discoverLoading = false;
    }
  }
</script>

<BackendCard {id} {label} {settings} {routeIsText} {routeIsImage}>
  <div class="cp-section">
    <div class="cp-section-head">
      <span class="cp-section-num">1</span>
      <div class="cp-section-meta">
        <b>Authentication</b>
        <small>API key from your account with this backend.</small>
      </div>
      <a class="cp-signup" href={signupUrl} target="_blank" rel="noopener noreferrer">
        Get key <ExternalLink size={12} />
      </a>
    </div>
    <div class="cp-key-row">
      <input
        class="cp-key-input"
        type={keyVisible ? 'text' : 'password'}
        dir="auto"
        aria-label={`${label} API key`}
        autocomplete="off"
        spellcheck="false"
        placeholder={keyPlaceholder ?? 'Paste API key here'}
        value={keyDraft ?? apiKey}
        oninput={(e) => {
          const v = (e.currentTarget as HTMLInputElement).value;
          keyDraft = v;
          onApiKeyChange(v);
          keySaved = true;
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
      {#if keySaved && (keyDraft ?? apiKey) === apiKey}
        <small class="cp-saved">{apiKey ? 'Key saved.' : 'Key removed.'}</small>
      {:else if apiKey && editedAgo}
        <small class="cp-edited">Edited {editedAgo}</small>
      {/if}
    </div>
  </div>

  {#if !disabled}
    <div class="cp-section">
      <div class="cp-section-head">
        <span class="cp-section-num">2</span>
        <div class="cp-section-meta">
          <b>Model</b>
          <small>
            {#if !apiKey}
              Add an API key first. The model list comes from the backend.
            {:else if discoveredModels.length > 0}
              {discoveredModels.length} discovered. Type or pick.
            {:else}
              Type a model id, or click refresh to pull the backend's list.
            {/if}
          </small>
        </div>
      </div>
      <div class="cp-model-row">
        <ModelCombobox
          value={model}
          placeholder="e.g. {label.toLowerCase()}'s flagship model id"
          options={discoveredModels}
          loading={discoverLoading}
          error={discoverError}
          disabled={!apiKey}
          onValueChange={onModelChange}
          onDiscover={() => void refreshModels()}
        />
        {#if defaultModelId !== undefined}
          <ResetField
            differsFromInherited={model !== defaultModelId}
            onReset={() => onModelChange(defaultModelId)}
            ariaLabel="Reset model id to default"
            inheritedLabel={`Default ${defaultModelId}`}
          />
        {/if}
      </div>
    </div>
  {/if}
</BackendCard>

<style>
  .cp-section {
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-md);
    background: var(--color-bg-elevated);
    padding: var(--space-3);
    margin-bottom: var(--space-2);
  }
  .cp-section:last-child {
    margin-bottom: 0;
  }
  .cp-section-head {
    display: flex;
    align-items: flex-start;
    gap: var(--space-2);
    margin-bottom: var(--space-2);
  }
  .cp-section-num {
    flex: 0 0 auto;
    width: 22px;
    height: 22px;
    border-radius: var(--radius-pill);
    background: var(--color-accent-bg-soft);
    color: var(--color-accent);
    font-size: var(--fs-xs);
    font-weight: 600;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .cp-section-meta {
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .cp-section-meta b {
    font-size: var(--fs-sm);
    color: var(--color-fg);
  }
  .cp-section-meta small {
    font-size: var(--fs-xs);
    color: var(--color-muted);
  }
  .cp-signup {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: var(--color-accent);
    font-size: var(--fs-xs);
    text-decoration: none;
    border: 1px solid var(--color-border);
    padding: 2px var(--space-2);
    border-radius: var(--radius-sm);
  }
  .cp-signup:hover {
    background: var(--color-accent-bg-hover);
    color: var(--color-accent);
  }
  .cp-key-row {
    display: flex;
    align-items: stretch;
    gap: var(--space-1);
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    padding: 2px;
    transition: border-color var(--motion-fast) var(--ease-out);
  }
  .cp-key-row:focus-within {
    border-color: var(--color-accent);
  }
  .cp-key-input {
    flex: 1 1 auto;
    border: 0;
    outline: none;
    background: transparent;
    color: var(--color-fg);
    font-family: var(--font-mono);
    font-size: var(--fs-sm);
    padding: var(--space-1) var(--space-2);
    caret-color: var(--color-accent);
  }
  .cp-key-input::placeholder {
    color: var(--color-muted);
    font-family: var(--font-ui);
  }
  .cp-key-meta {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    margin-top: var(--space-1);
    font-size: var(--fs-xs);
    color: var(--color-muted);
  }
  .cp-edited {
    font-size: var(--fs-xs);
    color: var(--color-muted);
    font-variant-numeric: tabular-nums;
  }
  .cp-saved {
    font-size: var(--fs-xs);
    color: var(--color-success-fg);
  }
  .cp-model-row {
    display: flex;
    align-items: flex-start;
    gap: var(--space-1);
  }
  .cp-model-row > :global(:first-child) {
    flex: 1 1 auto;
    min-width: 0;
  }
</style>
