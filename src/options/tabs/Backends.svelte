<script lang="ts">
  import { saveSettings } from '@/options/storage-with-toast';
  import type { Settings, BackendId } from '@/shared/types';
  import { asBackendIdUnsafe } from '@/shared/brands';
  import CloudProviderCard from '../components/CloudProviderCard.svelte';
  import { resolveBackend } from '@/shared/backends/registry';
  import { computeBackendOrder } from '@/shared/backends/select';
  import { backendNeedsKey, backendHasRequiredKey } from '@/shared/backends/key-presence';
  import { CLOUD_PROVIDER_IDS, apiKeyField, type CloudProviderId } from '@/shared/provider-ids';
  import { CLOUD_PROFILES, backendLabel } from '@/shared/backends/provider-profiles';
  import BackendList from '../components/BackendList.svelte';
  import NativeBackendCard from '../components/NativeBackendCard.svelte';
  import OllamaBackendRow from '../components/OllamaBackendRow.svelte';
  import LocalServerBackendRow from '../components/LocalServerBackendRow.svelte';
  import LocalBackendTuningSection from '../components/sections/LocalBackendTuningSection.svelte';
  import LoadingState from '@/shared/components/LoadingState.svelte';
  import TabHeader from '@/shared/components/TabHeader.svelte';

  interface Props {
    /** null while the initial load is in flight. */
    s: Settings | null;
    onSetSettings: (next: Settings) => void;
  }

  const { s, onSetSettings }: Props = $props();

  // computeBackendOrder keeps key-less ids the router skips; drop them or the markers show backends that never run.
  const routableOrder = $derived(
    s
      ? computeBackendOrder(s).filter(
          (id) => !(backendNeedsKey(id) && !backendHasRequiredKey(id, s)),
        )
      : [],
  );
  const resolvedTextId = $derived(routableOrder[0] ?? null);
  const resolvedImageId = $derived(
    routableOrder.find((id) => Boolean(resolveBackend(id)?.translateImage)) ?? null,
  );

  async function patch(p: Partial<Settings>): Promise<void> {
    const next = await saveSettings(p);
    if (next) onSetSettings(next);
  }

  async function patchModel(id: keyof Settings['model'], value: string): Promise<void> {
    if (!s) return;
    await patch({ model: { ...s.model, [id]: value } });
  }

  // Swap inside the group: crossing the enabled/disabled line moves the row to the other list.
  function reorderById(id: string, delta: -1 | 1): void {
    if (!s) return;
    const disabled = new Set<string>(s.disabledBackends ?? []);
    const idDisabled = disabled.has(id);
    const enabled = s.backendOrder.filter((b) => !disabled.has(b));
    const disabledRows = s.backendOrder.filter((b) => disabled.has(b));
    const group = idDisabled ? disabledRows : enabled;
    const i = group.findIndex((b) => b === id);
    const j = i + delta;
    const a = group[i];
    const b = group[j];
    if (i < 0 || j < 0 || j >= group.length || a === undefined || b === undefined) return;
    group[i] = b;
    group[j] = a;
    void patch({ backendOrder: [...enabled, ...disabledRows] });
  }

  function onGutterKeydown(e: KeyboardEvent, id: string): void {
    if (!e.altKey) return;
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      reorderById(id, -1);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      reorderById(id, 1);
    }
  }

  // A provider missing from this catalog still works, it just gets no card.
  type BackendCardDef = {
    id: BackendId;
    label: string;
    kind: 'cloud' | 'local' | 'localserver' | 'native';
  };
  type CloudCardDef = BackendCardDef & { kind: 'cloud'; signupUrl: string; keyPlaceholder: string };
  const CLOUD_CARDS: CloudCardDef[] = CLOUD_PROFILES.map((p) => ({
    id: asBackendIdUnsafe(p.id),
    kind: 'cloud',
    label: p.label,
    signupUrl: p.signupUrl,
    keyPlaceholder: p.keyPlaceholder,
  }));
  const LOCAL_CARDS: BackendCardDef[] = [
    { id: asBackendIdUnsafe('ollama'), kind: 'local', label: 'Ollama (local)' },
    {
      id: asBackendIdUnsafe('localserver'),
      kind: 'localserver',
      label: backendLabel('localserver'),
    },
  ];
  const CARDS: BackendCardDef[] = [
    ...CLOUD_CARDS,
    ...LOCAL_CARDS,
    { id: asBackendIdUnsafe('native'), kind: 'native', label: backendLabel('native') },
  ];

  function isCloudProviderId(id: string): id is CloudProviderId {
    return (CLOUD_PROVIDER_IDS as readonly string[]).includes(id);
  }
  function cloudApiKey(settings: Settings, id: string): string {
    if (!isCloudProviderId(id)) return '';
    return settings[apiKeyField(id)] ?? '';
  }
  function cloudModel(settings: Settings, id: string): string {
    return (settings.model as Record<string, string>)[id] ?? '';
  }
  async function onCloudApiKeyChange(id: string, value: string): Promise<void> {
    if (!isCloudProviderId(id)) return;
    const field = apiKeyField(id);
    const trimmed = value.trim();
    const prior = (s?.[field] ?? '').trim();
    const patchObj: Partial<Settings> = { [field]: value } as Partial<Settings>;
    if (trimmed && trimmed !== prior) {
      patchObj.apiKeyEditedAt = { ...s?.apiKeyEditedAt, [id]: Date.now() };
    }
    await patch(patchObj);
  }
  function cloudEditedAt(settings: Settings, id: string): number | undefined {
    if (!isCloudProviderId(id)) return undefined;
    return settings.apiKeyEditedAt?.[id];
  }
</script>

{#if !s}
  <LoadingState rows={5} label="Loading backend configuration…" />
{:else}
  <TabHeader tab="backends" />
  {@const ss = s as Settings}
  <BackendList settings={ss} onChange={(next) => void patch(next)} onMove={reorderById}>
    {#snippet children(id, position, enabled, useSummary)}
      {@const card = CARDS.find((c) => c.id === id)}
      {#if !card}
        <div class="be-row" data-be-row-id={id} data-be-row-missing>
          {id}: no card for this backend
        </div>
      {:else}
        <div class="be-row" data-be-row-id={id}>
          <span
            class="be-gutter"
            role="button"
            tabindex="0"
            aria-label="Reorder {card.label} — drag, or focus and press Alt+Arrow keys"
            use:useSummary
            onkeydown={(e) => onGutterKeydown(e, id)}
          >
            <span class="be-drag" aria-hidden="true">⋮⋮</span>
            <span class="be-pos">{position ?? '—'}</span>
          </span>
          {#if card.kind === 'cloud'}
            {@const cloudCard = CLOUD_CARDS.find((c) => c.id === id) as CloudCardDef}
            <div data-section="cloud" class="be-card-wrap">
              <CloudProviderCard
                id={cloudCard.id}
                label={cloudCard.label}
                settings={ss}
                apiKey={cloudApiKey(ss, cloudCard.id)}
                model={cloudModel(ss, cloudCard.id)}
                signupUrl={cloudCard.signupUrl}
                keyPlaceholder={cloudCard.keyPlaceholder}
                editedAt={cloudEditedAt(ss, cloudCard.id)}
                disabled={!enabled}
                onApiKeyChange={(v) => void onCloudApiKeyChange(cloudCard.id, v)}
                onModelChange={(v) => void patchModel(cloudCard.id as keyof Settings['model'], v)}
                routeIsText={cloudCard.id === resolvedTextId}
                routeIsImage={cloudCard.id === resolvedImageId}
              />
            </div>
          {:else if card.kind === 'local'}
            <div data-section="local" class="be-card-wrap">
              <OllamaBackendRow
                {id}
                label={card.label}
                settings={ss}
                routeIsText={id === resolvedTextId}
                routeIsImage={id === resolvedImageId}
                onPatch={(p) => void patch(p)}
                onModelChange={(v) => void patchModel('ollama', v)}
              />
            </div>
          {:else if card.kind === 'localserver'}
            <div data-section="local" class="be-card-wrap">
              <LocalServerBackendRow
                {id}
                label={card.label}
                settings={ss}
                routeIsText={id === resolvedTextId}
                routeIsImage={id === resolvedImageId}
                onPatch={(p) => void patch(p)}
                onModelChange={(v) => void patchModel('localserver', v)}
              />
            </div>
          {:else if card.kind === 'native'}
            <div data-section="native" class="be-card-wrap">
              <NativeBackendCard
                settings={ss}
                disabled={!enabled}
                routeIsText={id === resolvedTextId}
                routeIsImage={id === resolvedImageId}
                onPatch={(p) => void patch(p)}
                onPatchModel={(k, v) => void patchModel(k, v)}
              />
            </div>
          {/if}
        </div>
      {/if}
    {/snippet}
  </BackendList>

  <LocalBackendTuningSection
    settings={ss}
    onChange={(v) => void patch({ localBackendTimeoutMs: v })}
    onTogglePreWarm={(v) => void patch({ preWarmNative: v })}
  />
{/if}

<style>
  .be-row {
    display: flex;
    align-items: flex-start;
    gap: var(--space-2);
    margin-bottom: var(--space-2);
  }
  /* No opacity dim: group opacity drags the status pills below WCAG AA, and the Available-backends divider already marks disabled rows. */
  .be-gutter {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    gap: 2px;
    width: 24px;
    flex: 0 0 24px;
    align-self: stretch;
    padding-top: 10px;
    opacity: 0.55;
    user-select: none;
    cursor: grab;
    background: transparent;
    border: 0;
  }
  .be-gutter:hover {
    opacity: 0.95;
  }
  .be-gutter:active {
    cursor: grabbing;
  }
  .be-drag {
    font-size: 14px;
    line-height: 1;
    letter-spacing: -2px;
    color: var(--color-muted);
  }
  .be-pos {
    font-size: var(--fs-xs);
    font-variant-numeric: tabular-nums;
    color: var(--color-muted);
    line-height: 1;
  }
  .be-card-wrap {
    flex: 1;
    min-width: 0;
  }
</style>
