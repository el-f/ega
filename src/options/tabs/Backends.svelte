<script lang="ts" module>
  export interface GetStartedActions {
    onUseGemini: () => void;
    onUseOtherKey: () => void;
    onRunLocal: () => void;
    onSkip: () => void;
  }
</script>

<script lang="ts">
  import { untrack } from 'svelte';
  import { SvelteMap } from 'svelte/reactivity';
  import GetStartedCard from '../components/GetStartedCard.svelte';
  import { saveSettings, showSettingsWrite } from '@/options/storage-with-toast';
  import type { Settings, BackendId } from '@/shared/types';
  import { asBackendIdUnsafe } from '@/shared/brands';
  import CloudProviderCard from '../components/CloudProviderCard.svelte';
  import { getRegisteredBackendIds } from '@/shared/backends/registry';
  import { computeBackendOrder } from '@/shared/backends/select';
  import { backendNeedsKey, backendHasRequiredKey } from '@/shared/backends/key-presence';
  import { routePlan, type Readiness } from '@/shared/route-plan';
  import { liveImageAbility } from '@/options/route-state.svelte';
  import { setBackendRouteContext } from '@/options/backend-route-context';
  import Segmented from '@/shared/ui/Segmented.svelte';
  import GripVertical from '@lucide/svelte/icons/grip-vertical';
  import { CLOUD_PROVIDER_IDS, apiKeyField, type CloudProviderId } from '@/shared/provider-ids';
  import { CLOUD_PROFILES, backendLabel } from '@/shared/backends/provider-profiles';
  import BackendList from '../components/BackendList.svelte';
  import NativeBackendCard from '../components/NativeBackendCard.svelte';
  import OllamaBackendRow from '../components/OllamaBackendRow.svelte';
  import LocalServerBackendRow from '../components/LocalServerBackendRow.svelte';
  import BackendChecksSection from '../components/sections/BackendChecksSection.svelte';
  import LoadingState from '@/shared/components/LoadingState.svelte';
  import TabHeader from '@/shared/components/TabHeader.svelte';

  interface Props {
    /** null while the initial load is in flight. */
    s: Settings | null;
    onSetSettings: (next: Settings) => void;
    getStarted?: GetStartedActions | null;
  }

  const { s, onSetSettings, getStarted = null }: Props = $props();

  // Each row reports its own probe; a cloud key decides at once. routePlan turns these into the route tags.
  const probed = new SvelteMap<BackendId, Readiness>();
  const image = liveImageAbility(() => s);
  const plan = $derived.by(() => {
    if (!s) return null;
    const order = computeBackendOrder(s, getRegisteredBackendIds());
    const readiness = new Map(
      order.map((id): [BackendId, Readiness] => [
        id,
        backendNeedsKey(id)
          ? backendHasRequiredKey(id, s)
            ? 'ready'
            : 'not-ready'
          : (probed.get(id) ?? 'unknown'),
      ]),
    );
    return {
      order,
      readiness,
      ...routePlan(order, readiness, 1 + s.advanced.retryCount, image),
    };
  });
  const readyCount = $derived(
    plan ? [...plan.readiness.values()].filter((r) => r === 'ready').length : 0,
  );
  const depth = $derived(s ? 1 + s.advanced.retryCount : 1);
  // Only once every row in use has answered: a row still checking may yet be ready.
  const settled = $derived(plan ? ![...plan.readiness.values()].includes('unknown') : false);
  setBackendRouteContext({
    label: (id) => plan?.rows.find((r) => r.id === id)?.label ?? null,
    firstForImages: (id) => {
      if (!plan || plan.firstForImages !== id) return false;
      return plan.rows.find((r) => r.id === id)?.label.kind !== 'first';
    },
    readsImages: (id) => {
      const a = image(id);
      return a.answersImages && a.inImageChain !== false;
    },
    // Untracked: a row's report effect must depend on its own probe only, or two copies of a row mid-drag ping-pong.
    report: (id, readiness) => {
      if (untrack(() => probed.get(id)) !== readiness) probed.set(id, readiness);
    },
  });
  const DEPTHS = [1, 2, 3, 4].map((n) => ({ value: String(n), label: String(n) }));

  async function patch(p: Partial<Settings>): Promise<boolean> {
    return showSettingsWrite(await saveSettings(p), onSetSettings);
  }

  async function patchModel(id: keyof Settings['model'], value: string): Promise<void> {
    if (!s) return;
    await patch({ model: { ...s.model, [id]: value } });
  }

  // Swap inside the group: crossing the enabled/disabled line moves the row to the other list.
  function reorderById(id: string, delta: -1 | 1): Promise<boolean> | undefined {
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
    return patch({ backendOrder: [...enabled, ...disabledRows] });
  }

  function onGutterKeydown(
    e: KeyboardEvent,
    reorder: (delta: -1 | 1, handle: HTMLElement) => void,
  ): void {
    if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    e.preventDefault();
    reorder(e.key === 'ArrowUp' ? -1 : 1, e.currentTarget as HTMLElement);
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
  async function onCloudApiKeyChange(id: string, value: string): Promise<boolean> {
    if (!isCloudProviderId(id)) return false;
    const field = apiKeyField(id);
    const trimmed = value.trim();
    const prior = (s?.[field] ?? '').trim();
    const patchObj: Partial<Settings> = { [field]: value } as Partial<Settings>;
    if (trimmed && trimmed !== prior) {
      patchObj.apiKeyEditedAt = { ...s?.apiKeyEditedAt, [id]: Date.now() };
    }
    return patch(patchObj);
  }
  function cloudEditedAt(settings: Settings, id: string): number | undefined {
    if (!isCloudProviderId(id)) return undefined;
    return settings.apiKeyEditedAt?.[id];
  }
</script>

{#if !s}
  <LoadingState rows={5} label="Loading backend configuration…" />
{:else}
  <TabHeader
    tab="backends"
    info={{
      label: 'About backends',
      text: 'Cloud backends use your API key; local ones run on this computer. A key reads "Key saved" until a test passes, then "Verified".',
    }}
  />
  {#if getStarted}
    <GetStartedCard {...getStarted} />
  {/if}
  {@const ss = s as Settings}
  <BackendList settings={ss} onChange={(next) => patch(next)} onMove={reorderById}>
    {#snippet inUseHeader()}
      <div class="be-depth" data-ega-setting="advanced.retryCount">
        <span class="be-depth-label" id="be-depth-label">Try up to</span>
        <Segmented
          value={String(depth)}
          options={DEPTHS}
          ariaLabelledby="be-depth-label be-depth-unit"
          itemAttr="data-ega-depth"
          onchange={(v) =>
            void patch({ advanced: { retryCount: Number(v) - 1 } as Settings['advanced'] })}
        />
        <span class="be-depth-label" id="be-depth-unit">backends per request</span>
      </div>
      {#if settled && readyCount < depth}
        <p class="be-depth-note" data-ega-depth-note>
          {readyCount === 0
            ? 'No backend is ready, so Ega cannot answer yet'
            : readyCount === 1
              ? 'Only 1 backend is ready, so Ega has nothing to fall back on'
              : `Only ${readyCount} backends are ready, so Ega tries ${readyCount}`}
        </p>
      {/if}
    {/snippet}
    {#snippet children(id, position, enabled, useSummary, reorder)}
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
            onkeydown={(e) => onGutterKeydown(e, reorder)}
          >
            <span class="be-drag" aria-hidden="true"
              ><GripVertical size={16} strokeWidth={1.75} /></span
            >
            {#if position !== null}<span class="be-pos">{position}</span>{/if}
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
                onApiKeyChange={(v) => onCloudApiKeyChange(cloudCard.id, v)}
                onModelChange={(v) => void patchModel(cloudCard.id as keyof Settings['model'], v)}
              />
            </div>
          {:else if card.kind === 'local'}
            <div data-section="local" class="be-card-wrap">
              <OllamaBackendRow
                {id}
                label={card.label}
                settings={ss}
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
                onPatch={(p) => void patch(p)}
                onModelChange={(v) => void patchModel('localserver', v)}
              />
            </div>
          {:else if card.kind === 'native'}
            <div data-section="native" class="be-card-wrap">
              <NativeBackendCard
                settings={ss}
                disabled={!enabled}
                onPatch={(p) => void patch(p)}
                onPatchModel={(k, v) => void patchModel(k, v)}
              />
            </div>
          {/if}
        </div>
      {/if}
    {/snippet}
  </BackendList>

  <BackendChecksSection s={ss} onPatch={patch} />
{/if}

<style>
  .be-depth {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
  }
  .be-depth-label {
    font-size: var(--fs-base);
  }
  .be-depth-note {
    margin: 0;
    font-size: var(--fs-base);
    color: var(--color-warning-fg);
  }
  .be-row {
    display: flex;
    align-items: flex-start;
    gap: var(--space-2);
  }
  /* Handle and position number on one line, at the row's text line. */
  .be-gutter {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    min-width: 32px;
    min-height: 44px;
    flex: 0 0 auto;
    color: var(--color-muted);
    user-select: none;
    cursor: grab;
    border-radius: var(--radius-sm);
  }
  .be-gutter:hover {
    color: var(--color-fg);
  }
  .be-gutter:active {
    cursor: grabbing;
  }
  .be-gutter:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }
  .be-drag {
    display: inline-flex;
  }
  .be-pos {
    font-size: var(--fs-base);
    font-variant-numeric: tabular-nums;
  }
  /* The dragged copy keeps the number it had; the rows below already show where everything lands. */
  :global(#dnd-action-dragged-el) .be-pos {
    visibility: hidden;
  }
  .be-card-wrap {
    flex: 1;
    min-width: 0;
  }
</style>
