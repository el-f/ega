<script lang="ts">
  import { debugCatch } from '@/shared/logger';
  import AppShell from '@/shared/ui/AppShell.svelte';
  import OptionsNav from './OptionsNav.svelte';
  import OptionsHeader from './OptionsHeader.svelte';
  import OptionsTabContent, { tabReady, type TabId } from './OptionsTabContent.svelte';
  import StatusBar, { type StatusKind } from './components/StatusBar.svelte';
  import ShortcutOverlay from '@/shared/components/ShortcutOverlay.svelte';
  import CommandPalette from '@/shared/components/CommandPalette.svelte';
  import SettingsSearch from './components/SettingsSearch.svelte';
  import ToastHost from '@/shared/components/ToastHost.svelte';
  import { toastStore } from '@/shared/components/toastStore';
  import { onMount } from 'svelte';
  import { getCustomTasks, getSettings, onSettingsChanged } from '@/shared/storage';
  import { saveSettings } from './storage-with-toast';
  import { buildRegistry, type Command } from '@/shared/command-registry';
  import { computeBackendOrder } from '@/shared/backends/select';
  import { backendNeedsKey, backendHasRequiredKey } from '@/shared/backends/key-presence';
  import { applyTheme, type ThemePref } from '@/shared/theme';
  import type { Settings } from '@/shared/types';
  import type { NavItem, NavGroup } from './OptionsNav.svelte';
  import { TABS as TAB_SPECS, type TabSpec } from './tabs/_tab-spec';
  import { materializeTasks, taskLabel } from '@/shared/task-view';
  import { consumePendingOptionsTab, onPendingOptionsTab } from '@/shared/open-options-tab';
  import {
    DEEP_LINK_EVENT,
    revealPendingSetting,
    setPendingDeepLink,
    whenPresent,
  } from './deep-link';
  import { probeNativeHost } from './probeNativeHost';
  import { resolveBackend } from '@/shared/backends/registry';
  import { buildBackendConfig } from '@/shared/backends/build-config';
  import { untrack } from 'svelte';

  const NAV_GROUPS: readonly NavGroup[] = [
    { id: 'configuration', label: 'Configuration' },
    { id: 'system', label: 'System' },
  ];

  const SYSTEM_IDS: ReadonlySet<string> = new Set(['advanced', 'about']);
  function toNavItem(t: TabSpec): NavItem<TabId> {
    return {
      id: t.id,
      label: t.label,
      icon: t.icon,
      group: SYSTEM_IDS.has(t.id) ? 'system' : 'configuration',
    };
  }

  let active: TabId = $state('translate');
  let shortcutsOpen: boolean = $state(false);
  // raw, not deep: the tree is only ever replaced wholesale, and a deep proxy
  // reaches chrome.storage as a non-cloneable value.
  let liveSettings: Settings | null = $state.raw(null);

  const TABS: readonly NavItem<TabId>[] = TAB_SPECS.map(toNavItem);

  function isTabId(v: string | undefined): v is TabId {
    return typeof v === 'string' && TABS.some((t) => t.id === v);
  }
  // The Templates tab folded into Tasks, so a link or parked tab that still names it lands there.
  function tabFrom(v: string | undefined): TabId | null {
    if (v === 'templates') return 'tasks';
    return isTabId(v) ? v : null;
  }
  let paletteOpen = $state(false);
  let paletteCommands: readonly Command[] = $state([]);
  // Reads liveSettings so the modified filter and badges do not hit getSettings on every keystroke.
  let settingsSearchOpen = $state(false);

  async function buildPaletteRegistry(): Promise<readonly Command[]> {
    const customs = await getCustomTasks().catch(() => []);
    const views = liveSettings ? materializeTasks(liveSettings, customs) : null;
    return buildRegistry({
      onOpenOptions: (tab) => {
        const t = tabFrom(tab);
        if (t) active = t;
      },
      onSwapTheme: (to) => void setTheme(to),
      onSetBubbleMode: (m) => {
        void saveSettings({ bubbleMode: m });
      },
      ...(views ? { tasks: views.filter((v) => !v.disabled) } : {}),
      onSetTask: async (t) => {
        // Options cannot translate, so the palette action writes the default task for later translations instead.
        if (await saveSettings({ defaultTask: t })) {
          toastStore.push({
            message: `Default task set to ${taskLabel(views ?? [], t)}`,
            variant: 'success',
          });
        }
      },
      onAddRule: () => focusAddRule(),
      onShowShortcuts: () => {
        shortcutsOpen = true;
      },
      onCycleTheme: () => void cycleTheme(),
      currentTheme: theme,
    });
  }

  /** Jump to the Rules editor and focus the manual-add body. Shared by the
   *  Cmd+Shift+R chord and the "Add a rule" command-palette entry. */
  function focusAddRule(): void {
    active = 'tasks';
    // A cold tab chunk can take longer than the whole whenPresent budget, so the budget starts once the code is in.
    void tabReady('tasks').then(() =>
      whenPresent('[data-ega-manual-body]', (body) => {
        const block = body.closest('details.manual-block');
        if (block instanceof HTMLDetailsElement) block.open = true;
        if (body instanceof HTMLTextAreaElement) body.focus();
      }),
    );
  }

  // main.ts already subscribes to onSettingsChanged, so writing the theme here propagates to every open surface.
  let theme: ThemePref = $state('system');

  // Session override — set before Settings records a dismissal.
  let onboardingHidden: boolean = $state(false);

  // The router skips a disabled backend, so a key or URL parked on one must not count here.
  function hasConfiguredBackend(s: Settings): boolean {
    return computeBackendOrder(s).some((id) => {
      if (String(id) === 'ollama') return (s.ollamaUrl?.trim().length ?? 0) > 0;
      if (String(id) === 'localserver') return (s.localServerUrl?.trim().length ?? 0) > 0;
      if (backendNeedsKey(id)) return backendHasRequiredKey(id, s);
      return false;
    });
  }

  // Installed is enough — the CLI spawns on first use, so a cold host still counts,
  // and so does 'outdated'. Same probe the Backends card uses, or the two disagree.
  let nativeAvailable: boolean = $state(false);

  // Only polled while the banner could show, and slowly: each probe opens a host
  // connection, and installing one is a rare deliberate act.
  const nativeProbeCandidate = $derived.by((): boolean => {
    const s = liveSettings;
    if (!s) return false;
    if (hasConfiguredBackend(s)) return false;
    return computeBackendOrder(s).some((id) => String(id) === 'native');
  });

  // Ollama and the local server need no URL to be configured: the server at the default address answers or it does not.
  const LOCAL_SERVER_IDS: readonly string[] = ['ollama', 'localserver'];
  const localProbeIds = $derived.by((): string | null => {
    const s = liveSettings;
    if (!s || hasConfiguredBackend(s)) return null;
    const ids = computeBackendOrder(s)
      .map(String)
      .filter((id) => LOCAL_SERVER_IDS.includes(id));
    return ids.length > 0 ? ids.join(',') : null;
  });
  let localServerAvailable: boolean = $state(false);
  const localProbeKey = $derived.by((): string | null => {
    const cur: Settings | null = liveSettings;
    return cur
      ? `${cur.ollamaUrl ?? ''}|${cur.localServerUrl ?? ''}|${cur.localBackendTimeoutMs ?? ''}`
      : null;
  });
  $effect(() => {
    const ids = localProbeIds;
    if (ids === null) {
      localServerAvailable = false;
      return;
    }
    // A derived primitive: the raw settings object is replaced on every write, but this string only changes with a URL or the timeout.
    void localProbeKey;
    const s = untrack(() => liveSettings);
    if (!s) return;
    const cfg = buildBackendConfig(s);
    let cancelled = false;
    void Promise.all(
      ids
        .split(',')
        .map((id) =>
          (resolveBackend(id)?.isAvailable(cfg) ?? Promise.resolve(false)).catch(() => false),
        ),
    ).then((answers) => {
      if (!cancelled) localServerAvailable = answers.some(Boolean);
    });
    return () => {
      cancelled = true;
    };
  });

  const hasUsableBackend = $derived.by((): boolean => {
    const s = liveSettings;
    if (!s) return false;
    return (
      hasConfiguredBackend(s) ||
      (nativeProbeCandidate && nativeAvailable) ||
      (localProbeIds !== null && localServerAvailable)
    );
  });

  const needsKey = $derived(liveSettings !== null && !hasUsableBackend);

  const PROBE_DELAYS_MS: readonly number[] = [5_000, 15_000, 60_000];
  const PROBE_MAX_MISSES = 6;

  $effect(() => {
    if (!nativeProbeCandidate) {
      nativeAvailable = false;
      return () => {};
    }
    let cancelled = false;
    let found = false;
    let misses = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const stop = (): void => {
      if (timer !== null) clearTimeout(timer);
      timer = null;
    };
    const schedule = (): void => {
      stop();
      if (misses >= PROBE_MAX_MISSES) return;
      const step = Math.min(Math.max(misses, 1), PROBE_DELAYS_MS.length) - 1;
      timer = setTimeout(() => void tick(), PROBE_DELAYS_MS[step] ?? 60_000);
    };
    const tick = async (): Promise<void> => {
      if (cancelled || found) return;
      try {
        const r = await probeNativeHost(untrack(() => liveSettings?.localBackendTimeoutMs));
        if (cancelled) return;
        // 'installed' and 'outdated' both mean the host is reachable and can
        // translate; 'not_installed'/'error' mean it can't.
        found = r.status === 'installed' || r.status === 'outdated';
        nativeAvailable = found;
        if (found) {
          stop();
          return;
        }
        misses += 1;
      } catch {
        /* leave previous value until next tick */
      }
      schedule();
    };
    // Installing the host happens outside the browser, so a return to this tab is the real signal.
    const onVisible = (): void => {
      if (found || document.visibilityState !== 'visible') return;
      misses = 0;
      void tick();
    };

    void tick();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      stop();
      document.removeEventListener('visibilitychange', onVisible);
    };
  });

  // Welcome copy belongs where a backend gets picked; elsewhere the short needs-key bar covers it.
  const showOnboarding = $derived.by((): boolean => {
    const s = liveSettings;
    if (active !== 'translate' && active !== 'backends') return false;
    if (onboardingHidden || !s || s.onboardingDismissed === true) return false;
    return !hasUsableBackend;
  });

  // Both are true on a fresh install, so onboarding wins; dismissing it clears the flag and the short bar takes over.
  const statusKind = $derived.by((): StatusKind | null => {
    if (showOnboarding) return 'onboarding';
    if (needsKey) return 'needs-key';
    return null;
  });

  const onKey = (e: KeyboardEvent): void => {
    const el = document.activeElement;
    const editable =
      el instanceof HTMLInputElement ||
      el instanceof HTMLTextAreaElement ||
      (el instanceof HTMLElement && el.isContentEditable);

    // Cmd/Ctrl+K wins even inside an editable field, because Options has no find-in-page to conflict with.
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      void buildPaletteRegistry().then((cmds) => {
        paletteCommands = cmds;
        paletteOpen = true;
      });
      return;
    }

    // Cmd/Ctrl+, mirrors VS Code's "open settings". Skip in editable
    // fields so typing a comma into a textarea isn't hijacked.
    if ((e.ctrlKey || e.metaKey) && e.key === ',') {
      if (editable) return;
      e.preventDefault();
      void getSettings()
        .then((next) => {
          liveSettings = next;
        })
        .catch((err) => debugCatch(err, 'options.Options.search'));
      settingsSearchOpen = true;
      return;
    }

    if (e.key === '?') {
      if (editable) return;
      e.preventDefault();
      shortcutsOpen = true;
      return;
    }

    // Shift is required because Cmd/Ctrl+R alone is browser refresh.
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'r') {
      if (editable) return;
      e.preventDefault();
      focusAddRule();
      return;
    }

    // Cmd/Ctrl+Shift+T — cycle theme system → light → dark → system.
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 't') {
      if (editable) return;
      e.preventDefault();
      void cycleTheme();
      return;
    }

    // Physical key, not the character: macOS Option+1 produces '¡', never '1'.
    if (e.altKey && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      const m = /^Digit([1-9])$/.exec(e.code);
      if (m?.[1]) {
        if (editable) return;
        const target = TABS[Number(m[1]) - 1];
        if (target) {
          e.preventDefault();
          active = target.id;
        }
      }
    }
  };

  onMount(async () => {
    try {
      const s = await getSettings();
      theme = s.theme;
      liveSettings = s;
    } catch (e) {
      debugCatch(e, 'options.Options.1');
    }
    // Fire-and-forget: brief default-tab flash is fine; awaiting here can
    // hang in test envs where chrome.storage callback isn't invoked.
    void consumePendingOptionsTab()
      .then((pending) => {
        const t = tabFrom(pending ?? undefined);
        if (t) active = t;
      })
      .catch((e: unknown) => debugCatch(e, 'options.Options.pendingTab'));
  });

  // openOptionsPage only focuses a page that is already open, so the parked tab has to be picked up live.
  $effect(() =>
    onPendingOptionsTab((pending) => {
      const t = tabFrom(pending);
      if (t) active = t;
    }),
  );

  // An async onMount can't own teardown — Svelte 5 gets a Promise, not a
  // cleanup function, so the listener leaks.
  $effect(() => {
    document.addEventListener('keydown', onKey);
    const unsub = onSettingsChanged((next) => {
      theme = next.theme;
      liveSettings = next;
    });
    return () => {
      document.removeEventListener('keydown', onKey);
      unsub();
    };
  });

  // Rail arrow keys re-focus their tab in a later microtask; stealing focus into the panel here would break roving tabindex.
  let keepFocusOnRail = false;

  // queueMicrotask defers until Svelte has flushed the new panel, so focus lands on live content, not a stale trigger.
  $effect(() => {
    void active;
    const skipFocus = keepFocusOnRail;
    keepFocusOnRail = false;
    queueMicrotask(() => {
      // At narrow widths the document scrolls independently of `.options-content`, so both need resetting.
      window.scrollTo({ top: 0, left: 0 });
      const panel = document.querySelector<HTMLElement>('.options-content');
      if (panel) {
        panel.scrollTop = 0;
        // Without preventScroll, focusing the panel scrolls it into view and undoes the window reset above.
        if (!skipFocus) panel.focus({ preventScroll: true });
      }
    });
  });

  async function chooseGemini(): Promise<void> {
    // Don't flip onboardingDismissed yet — let them complete the key entry.
    active = 'backends';
    onboardingHidden = true;
    queueMicrotask(() => {
      queueMicrotask(() => {
        const card = document.querySelector<HTMLDetailsElement>(
          "details[data-backend-id='gemini']",
        );
        if (!card) return;
        card.open = true;
        card.scrollIntoView({ block: 'center' });
        card.querySelector<HTMLInputElement>('.cp-key-input')?.focus({ preventScroll: true });
      });
    });
  }

  async function dismissOnboarding(): Promise<void> {
    onboardingHidden = true;
    if (!(await saveSettings({ onboardingDismissed: true }))) onboardingHidden = false;
  }

  function jumpToSetting(tab: TabId, entryId: string): void {
    const sameTab = active === tab;
    if (entryId) setPendingDeepLink(entryId);
    active = tab;
    // A same-tab jump does not remount the pane, so it needs an explicit re-resolve signal.
    if (sameTab) document.dispatchEvent(new CustomEvent(DEEP_LINK_EVENT));
    void tabReady(tab).then(() => revealPendingSetting());
  }
  async function openSettingsSearch(): Promise<void> {
    try {
      liveSettings = await getSettings();
    } catch (e) {
      debugCatch(e, 'options.Options.search-button');
    }
    settingsSearchOpen = true;
  }

  async function setTheme(next: ThemePref): Promise<void> {
    const prior = theme;
    theme = next;
    applyTheme(next);
    if (await saveSettings({ theme: next })) return;
    theme = prior;
    applyTheme(prior);
  }

  const THEME_CYCLE: readonly ThemePref[] = ['system', 'light', 'dark'];
  async function cycleTheme(): Promise<void> {
    const idx = THEME_CYCLE.indexOf(theme);
    const next = THEME_CYCLE[(idx + 1) % THEME_CYCLE.length] ?? 'system';
    await setTheme(next);
  }
</script>

<div class="options-root">
  <AppShell>
    {#snippet header()}
      <OptionsHeader
        {theme}
        onOpenSearch={() => void openSettingsSearch()}
        onSetTheme={(t) => void setTheme(t)}
      />
    {/snippet}

    <div class="options-main">
      <aside class="options-rail">
        <OptionsNav
          items={TABS}
          groups={NAV_GROUPS}
          {active}
          onSelect={(id, source) => {
            if (isTabId(id)) {
              keepFocusOnRail = source === 'keyboard';
              active = id;
            }
          }}
        />
      </aside>

      <div
        class="options-content"
        role="tabpanel"
        id={`tabpanel-${active}`}
        aria-labelledby={`tab-${active}`}
        tabindex="0"
      >
        <StatusBar
          kind={statusKind}
          onChooseGemini={chooseGemini}
          onDismissOnboarding={dismissOnboarding}
          onJumpToBackends={() => (active = 'backends')}
        />
        <OptionsTabContent
          {active}
          s={liveSettings}
          onSetSettings={(next) => (liveSettings = next)}
        />
      </div>
    </div>
  </AppShell>
</div>

<ShortcutOverlay
  open={shortcutsOpen}
  onClose={() => (shortcutsOpen = false)}
  surface="options"
  shortcut={liveSettings?.shortcut}
  pickerShortcut={liveSettings?.pickerShortcut}
/>
<CommandPalette
  open={paletteOpen}
  commands={paletteCommands}
  onClose={() => (paletteOpen = false)}
/>
<SettingsSearch
  open={settingsSearchOpen}
  settings={liveSettings}
  onClose={() => (settingsSearchOpen = false)}
  onJump={jumpToSetting}
/>
<ToastHost position="bottom-right" {theme} />

<style>
  /* Container-query scoped, not viewport: the options page can be framed inside a narrow extension panel.
     The container is the root, not .options-main: an element cannot query its own size, so the rail never collapsed. */
  .options-root {
    min-height: 100vh;
    background: var(--color-bg);
    container-type: inline-size;
    container-name: options;
  }

  .options-main {
    display: grid;
    grid-template-columns: 220px 1fr;
    gap: var(--space-5);
    align-items: start;
  }
  /* 48px = 40px button + 4px card padding each side, matching the @container rule in OptionsNav that hides labels. */
  @container options (max-width: 880px) {
    .options-main {
      grid-template-columns: 48px 1fr;
    }
  }
  .options-rail {
    position: sticky;
    top: var(--space-4);
  }
  .options-content {
    min-width: 0;
    min-height: 300px;
  }

  /* Deep-link landing flash. Lives here, not in the lazy Advanced chunk, so it reaches every tab. */
  :global([data-flash='true']) {
    animation: ega-jump-flash var(--motion-pulse) var(--ease-out);
    border-radius: var(--radius-md);
  }
  @keyframes ega-jump-flash {
    0% {
      box-shadow: 0 0 0 0 var(--color-accent);
    }
    50% {
      box-shadow: 0 0 0 4px var(--color-accent-bg-soft);
    }
    100% {
      box-shadow: 0 0 0 0 transparent;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    :global([data-flash='true']) {
      animation: none;
    }
  }
</style>
