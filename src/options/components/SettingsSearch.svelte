<script lang="ts">
  import { tick } from 'svelte';
  import { Command } from 'bits-ui';
  import Dialog from '@/shared/ui/Dialog.svelte';
  import Input from '@/shared/ui/Input.svelte';
  import Checkbox from '@/shared/ui/Checkbox.svelte';
  import Search from '@lucide/svelte/icons/search';
  import Kbd from '@/shared/ui/Kbd.svelte';
  import Button from '@/shared/ui/Button.svelte';
  import {
    SETTINGS_SEARCH_MAX_RESULTS,
    SETTINGS_REGISTRY,
    TAB_LABELS,
    searchSettings,
    type SearchResult,
    type SettingsTab,
  } from '@/shared/settings-registry';
  import SettingsListView from '@/options/components/SettingsListView.svelte';
  import type { SettingsListItem } from '@/options/components/SettingsListView.types';
  import { SEARCH_RECENT_KEY } from '@/options/local-ui-keys';
  import type { Settings } from '@/shared/types';

  const POPULAR_IDS: readonly string[] = [
    'advanced.temperature',
    'advanced.translateTimeoutMs',
    'advanced.cacheSettings',
    'display.bubbleMode',
    'display.theme',
    'backends.backendOrder',
    'languages.varieties',
  ];
  const POPULAR_ENTRIES: readonly SearchResult[] = POPULAR_IDS.flatMap((id) => {
    const entry = SETTINGS_REGISTRY.find((e) => e.id === id);
    return entry ? [{ ...entry, score: 0, matchedTerm: entry.label }] : [];
  });

  const EXAMPLES = ['temperature', 'cache', 'backend', 'shortcut'] as const;

  const RECENT_MAX = 5;
  function readRecent(): readonly string[] {
    try {
      const raw = localStorage.getItem(SEARCH_RECENT_KEY);
      if (!raw) return [];
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((v): v is string => typeof v === 'string').slice(0, RECENT_MAX);
    } catch {
      return [];
    }
  }
  function pushRecent(id: string): void {
    try {
      const cur = readRecent();
      const next = [id, ...cur.filter((v) => v !== id)].slice(0, RECENT_MAX);
      localStorage.setItem(SEARCH_RECENT_KEY, JSON.stringify(next));
      recentIds = next;
    } catch {
      // localStorage unavailable (private mode etc.) — silently degrade.
    }
  }

  interface Props {
    open: boolean;
    settings: Settings | null;
    onClose: () => void;
    /** entryId is SettingEntry.id — e.g. 'advanced.temperature'. */
    onJump: (tab: SettingsTab, entryId: string) => void;
  }

  let { open, settings, onClose, onJump }: Props = $props();

  let query = $state('');
  let modifiedOnly = $state(false);
  let recentIds = $state<readonly string[]>(readRecent());

  const recentEntries = $derived.by<readonly SearchResult[]>(() => {
    const out: SearchResult[] = [];
    for (const id of recentIds) {
      const entry = SETTINGS_REGISTRY.find((e) => e.id === id);
      if (entry) out.push({ ...entry, score: 0, matchedTerm: entry.label });
    }
    return out;
  });

  const allResults = $derived.by<readonly SearchResult[]>(() => {
    if (!query.trim()) return [];
    return searchSettings(query, {
      modifiedOnly,
      ...(settings ? { settings } : {}),
    });
  });
  const visibleResults = $derived(allResults.slice(0, SETTINGS_SEARCH_MAX_RESULTS));
  const overflow = $derived(allResults.length - visibleResults.length);

  // Lets the empty state say "none are modified" instead of the generic "no match".
  const unfilteredHasMatches = $derived.by<boolean>(() => {
    if (!modifiedOnly || !query.trim()) return false;
    return searchSettings(query, { ...(settings ? { settings } : {}) }).length > 0;
  });

  // aria-controls must point at a rendered list, so aria-expanded tracks hasOptions.
  const SEARCH_LIST_ID = 'ega-settings-search-list';
  const hasOptions = $derived(
    query.trim()
      ? visibleResults.length > 0
      : recentEntries.length > 0 || POPULAR_ENTRIES.length > 0,
  );

  // Reset on open — a reopen after a jump would otherwise show the old hits.
  $effect(() => {
    if (open) query = '';
  });

  // Bits never scrolls the first row of a list into view, including when it reselects it.
  function scrollOptionIntoView(selector: string): void {
    void tick().then(() =>
      document
        .getElementById(SEARCH_LIST_ID)
        ?.querySelector(selector)
        ?.scrollIntoView({ block: 'nearest' }),
    );
  }

  // A new result list puts the selection back on its first row.
  $effect(() => {
    void visibleResults;
    scrollOptionIntoView('[role="option"]');
  });

  function jump(r: SearchResult): void {
    pushRecent(r.id);
    onJump(r.tab, r.id);
    onClose();
  }

  function toItem(r: SearchResult, opts: { highlight?: boolean } = {}): SettingsListItem {
    const item: SettingsListItem = {
      id: r.id,
      label: r.label,
      description: r.description,
      tab: r.tab,
      tabLabel: TAB_LABELS[r.tab],
      modified: r.isModified ? (settings ? r.isModified(settings) : false) : false,
    };
    if (opts.highlight) {
      const q = query.trim();
      if (q) return { ...item, highlightQuery: q };
    }
    return item;
  }

  // The root wraps the hint and messages too: role="application" would switch off screen-reader
  // browse mode for them, and keys reach the list through the input, so the root needs no focus.
  function plainRoot(props: Record<string, unknown>): Record<string, unknown> {
    const { role: _role, tabindex: _tabindex, onkeydown: _onkeydown, ...rest } = props;
    return rest;
  }

  // The list takes keys from the search input only, so Enter on Clear or the checkbox keeps its
  // meaning. Home and End stay with the input caret.
  function listKeys(rootKeydown: unknown): (e: KeyboardEvent) => void {
    return (e) => {
      if (e.key === 'Home' || e.key === 'End') return;
      if (typeof rootKeydown === 'function') rootKeydown(e);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        scrollOptionIntoView('[role="option"][data-selected]');
      }
    };
  }
</script>

{#snippet option(r: SearchResult, section: string, highlight = false)}
  <Command.Item value="{section}:{r.id}" id="slv-opt-{section}-{r.id}" onSelect={() => jump(r)}>
    {#snippet child({ props })}
      <SettingsListView item={toItem(r, { highlight })} optionProps={props} />
    {/snippet}
  </Command.Item>
{/snippet}

<Dialog {open} label="Search settings" {onClose} size="lg" position="top">
  <Command.Root shouldFilter={false} loop vimBindings={false}>
    {#snippet child({ props: rootProps })}
      <div {...plainRoot(rootProps)} class="ss-root">
        <div class="ss-input-row">
          <Command.Input value={query}>
            {#snippet child({ props })}
              <Input
                bind:value={query}
                placeholder="Search settings…"
                onkeydown={listKeys(rootProps['onkeydown'])}
                ariaLabel="Search settings"
                clearable
                comboboxProps={{
                  role: 'combobox',
                  'aria-expanded': hasOptions,
                  'aria-haspopup': 'listbox',
                  'aria-controls': SEARCH_LIST_ID,
                  ...(typeof props['aria-activedescendant'] === 'string'
                    ? { 'aria-activedescendant': props['aria-activedescendant'] }
                    : {}),
                }}
              >
                {#snippet leading()}
                  <Search size={16} strokeWidth={1.75} />
                {/snippet}
              </Input>
            {/snippet}
          </Command.Input>
        </div>

        <div class="ss-modified-row">
          <Checkbox bind:checked={modifiedOnly} label="Modified only" size="sm" />
        </div>

        {#if !query.trim()}
          <p class="ss-hint">
            Search across every tab. Try:
            {#each EXAMPLES as ex (ex)}
              <Button variant="secondary" size="sm" onclick={() => (query = ex)}>{ex}</Button>
            {/each}
          </p>
        {/if}

        {#if hasOptions}
          <Command.List
            id={SEARCH_LIST_ID}
            aria-label={query.trim() ? 'Settings results' : 'Suggested settings'}
          >
            <Command.Viewport>
              {#if !query.trim()}
                {#if recentEntries.length > 0}
                  <Command.Group value="recent">
                    <Command.GroupHeading class="ss-popular-header" data-ega-recent-header>
                      Recently used
                    </Command.GroupHeading>
                    <Command.GroupItems data-ega-recent-list>
                      {#each recentEntries as r (r.id)}
                        {@render option(r, 'recent')}
                      {/each}
                    </Command.GroupItems>
                  </Command.Group>
                {/if}
                {#if POPULAR_ENTRIES.length > 0}
                  <Command.Group value="popular">
                    <Command.GroupHeading class="ss-popular-header">
                      Popular settings
                    </Command.GroupHeading>
                    <Command.GroupItems>
                      {#each POPULAR_ENTRIES as r (r.id)}
                        {@render option(r, 'popular')}
                      {/each}
                    </Command.GroupItems>
                  </Command.Group>
                {/if}
              {:else}
                <div class="ss-results">
                  {#each visibleResults as r (r.id)}
                    {@render option(r, 'result', true)}
                  {/each}
                </div>
              {/if}
            </Command.Viewport>
          </Command.List>
          {#if overflow > 0}
            <p class="ss-overflow">
              Showing {visibleResults.length} of {allResults.length}. Refine the query for the rest.
            </p>
          {/if}
          <p class="ss-keys">
            <Kbd>↑↓</Kbd> move · <Kbd>Enter</Kbd> open · <Kbd>Esc</Kbd> close
          </p>
        {:else if query.trim()}
          {#if unfilteredHasMatches}
            <p class="ss-empty" role="status">
              No modified settings match — uncheck <b>Modified only</b>.
            </p>
          {:else}
            <p class="ss-empty" role="status">
              No settings match <b>"{query}"</b>. Check the spelling or try a different word.
            </p>
          {/if}
        {/if}
      </div>
    {/snippet}
  </Command.Root>
</Dialog>

<style>
  .ss-root {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .ss-input-row {
    display: flex;
    align-items: center;
  }
  .ss-modified-row {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--fs-sm);
    color: var(--color-muted);
    user-select: none;
  }
  .ss-hint {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1) var(--space-2);
    margin: 0;
    font-size: var(--fs-sm);
    color: var(--color-muted);
    line-height: 1.5;
  }
  .ss-keys {
    margin: 0;
    font-size: var(--fs-xs);
    color: var(--color-muted);
  }
  .ss-empty {
    margin: 0;
    padding: var(--space-3);
    color: var(--color-muted);
    font-size: var(--fs-sm);
  }
  .ss-root :global([data-command-viewport]),
  .ss-root :global([data-command-group]) {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .ss-root :global([data-command-group-items]),
  .ss-results {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .ss-root :global(.ss-popular-header) {
    margin-top: var(--space-2);
    padding: 0 var(--space-1);
    font-size: var(--fs-xs);
    color: var(--color-fg-subtle);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-weight: 500;
  }
  .ss-overflow {
    margin: 0;
    padding-top: var(--space-2);
    border-top: 1px solid var(--color-border-subtle);
    font-size: var(--fs-xs);
    color: var(--color-muted);
    text-align: center;
  }
</style>
