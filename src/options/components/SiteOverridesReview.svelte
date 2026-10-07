<script lang="ts">
  /** The Site overrides card: one row per site, removed at once with Undo. */
  import { onMount, tick } from 'svelte';
  import type { Settings, Variety } from '@/shared/types';
  import { replaceSitePrefs } from '@/shared/storage';
  import { saveVia } from '@/options/storage-with-toast';
  import { toastStore } from '@/shared/components/toastStore';
  import SectionCard from '@/shared/ui/SectionCard.svelte';
  import EmptyState from '@/shared/components/EmptyState.svelte';
  import Input from '@/shared/ui/Input.svelte';
  import Button from '@/shared/ui/Button.svelte';
  import IconButton from '@/shared/ui/IconButton.svelte';
  import Globe from '@lucide/svelte/icons/globe';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import { listVarieties } from '@/shared/varieties';
  import { isIsoCode, labelFor } from '@/shared/languages';
  import {
    groupSiteOverrides,
    type SiteOverrideRow,
  } from '@/options/components/site-override-rows';

  interface Props {
    settings: Settings;
    onSaved: (next: Settings) => void;
  }

  const { settings, onSaved }: Props = $props();

  type SitePrefs = Settings['sitePrefs'];
  const rows = $derived(groupSiteOverrides(settings.sitePrefs));

  let varieties = $state.raw<Variety[]>([]);
  onMount(() => {
    void listVarieties().then((vs) => (varieties = vs));
  });
  function languageName(id: string): string {
    if (id === 'auto') return 'Auto-detect';
    return varieties.find((v) => v.id === id)?.label ?? (isIsoCode(id) ? labelFor(id) : id);
  }
  function stateOf(row: SiteOverrideRow): string {
    return [
      ...(row.pref.disabled ? ['Ega is off'] : []),
      ...(row.pref.defaultLang ? [`Source: ${languageName(row.pref.defaultLang)}`] : []),
    ].join(' · ');
  }

  // A short list is read at a glance; the filter earns its space only on a long one.
  const FILTER_MIN_ROWS = 10;
  let query = $state('');
  const needle = $derived(rows.length >= FILTER_MIN_ROWS ? query.trim().toLowerCase() : '');
  const shown = $derived(
    needle === '' ? rows : rows.filter((r) => r.label.toLowerCase().includes(needle)),
  );
  let listEl = $state<HTMLUListElement | null>(null);

  /** Takes `keys` out under the lock and returns what they held, for Undo. */
  async function take(keys: readonly string[] | null): Promise<SitePrefs | null> {
    let removed: SitePrefs = {};
    const next = await saveVia(() =>
      replaceSitePrefs((cur) => {
        const out: SitePrefs = {};
        removed = {};
        for (const [k, v] of Object.entries(cur)) {
          if (keys === null || keys.includes(k)) removed[k] = v;
          else out[k] = v;
        }
        return out;
      }),
    );
    if (!next) return null;
    onSaved(next);
    return removed;
  }

  // A site changed since the remove keeps its newer value.
  function undoWith(removed: SitePrefs, save: (next: Settings) => void): () => void {
    return () =>
      void saveVia(() => replaceSitePrefs((cur) => ({ ...removed, ...cur }))).then((next) => {
        if (next) save(next);
      });
  }

  async function removeOne(row: SiteOverrideRow): Promise<void> {
    const at = shown.indexOf(row);
    const save = onSaved;
    const removed = await take(row.keys);
    if (!removed) return;
    await tick();
    // The next row's remove button, else the previous one's, else the card title.
    const buttons = listEl?.querySelectorAll<HTMLElement>('[data-ega-site-override-clear]') ?? [];
    (
      buttons[Math.min(at, buttons.length - 1)] ??
      document.querySelector<HTMLElement>('[data-ega-per-site-card] h2')
    )?.focus();
    toastStore.push({
      message: `Removed ${row.label}`,
      variant: 'success',
      action: { label: 'Undo', onClick: undoWith(removed, save) },
    });
  }

  async function removeAll(): Promise<void> {
    const n = rows.length;
    const save = onSaved;
    const removed = await take(null);
    if (!removed) return;
    await tick();
    document.querySelector<HTMLElement>('[data-ega-per-site-card] h2')?.focus();
    toastStore.push({
      message: `Removed ${n} site ${n === 1 ? 'override' : 'overrides'}`,
      variant: 'success',
      action: { label: 'Undo', onClick: undoWith(removed, save) },
    });
  }
</script>

<div data-ega-per-site-card data-ega-setting="advanced.siteOverrides">
  <SectionCard
    title="Site overrides"
    description="Sites where Ega is off or uses its own source language"
    info={{
      label: 'About site overrides',
      text: 'Change these from the right-click menu on a page: Ega, then Disable Ega on this site.',
    }}
  >
    {#snippet headerActions()}
      {#if rows.length > 0}
        <Button
          variant="secondary"
          size="sm"
          dataAttrs={{ 'data-ega-site-override-clear-all': true }}
          onclick={() => void removeAll()}>Remove all</Button
        >
      {/if}
    {/snippet}
    <div class="site-overrides-review" data-ega-site-overrides-review>
      {#if rows.length === 0}
        <EmptyState
          title="No site overrides yet"
          description="Sites you turn off from the right-click menu show here"
          icon={Globe}
        />
      {:else}
        {#if rows.length >= FILTER_MIN_ROWS}
          <Input bind:value={query} placeholder="Filter sites" ariaLabel="Filter sites" size="sm" />
        {/if}
        {#if shown.length === 0}
          <p class="host-empty">No site matches "{query.trim()}"</p>
        {/if}
        <ul class="host-list" bind:this={listEl}>
          {#each shown as row (row.label)}
            <li class="host-row" data-ega-site-override-row data-ega-site-override-host={row.label}>
              <!-- A long host is cut with an ellipsis; its title holds the whole name (R17). -->
              <span class="host-name" title={row.label} data-ega-truncates>{row.label}</span>
              <span class="host-state" data-ega-site-override-state>{stateOf(row)}</span>
              <IconButton
                icon={Trash2}
                ariaLabel={`Remove ${row.label}`}
                tooltip="Remove"
                size="sm"
                dataAttrs={{ 'data-ega-site-override-clear': true }}
                onclick={() => void removeOne(row)}
              />
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  </SectionCard>
</div>

<style>
  .site-overrides-review {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .host-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .host-empty {
    margin: 0;
    font-size: var(--fs-base);
    color: var(--color-muted);
  }
  /* Rows sit in the card, so a hairline sets them apart, not a box. */
  .host-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    align-items: center;
    gap: var(--space-3);
    min-height: 40px;
  }
  .host-row + .host-row {
    border-top: 1px solid var(--color-border-subtle);
  }
  .host-name {
    font-size: var(--fs-base);
    color: var(--color-fg);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .host-state {
    font-size: var(--fs-base);
    color: var(--color-muted);
  }
</style>
