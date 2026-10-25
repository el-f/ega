<script lang="ts" module>
  export type BackendStatus = 'unknown' | 'ready' | 'needs-config' | 'unavailable';
  export type BackendKind = 'cloud' | 'local' | 'native';
</script>

<script lang="ts">
  /** The collapsed row's facts: "Text only", one status pill (icon plus word) and the route tag. */
  import Check from '@lucide/svelte/icons/check';
  import KeyRound from '@lucide/svelte/icons/key-round';
  import AlertTriangle from '@lucide/svelte/icons/alert-triangle';
  import CircleX from '@lucide/svelte/icons/circle-x';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';
  import Badge from '@/shared/ui/Badge.svelte';
  import type { RouteLabel } from '@/shared/route-plan';

  interface Props {
    kind: BackendKind;
    beStatus: BackendStatus;
    supportsImage: boolean;
    /** When a key test last passed with the current key and model; null when it has not. */
    verifiedAt: number | null;
    /** The last key test failed. */
    testFailed: boolean;
    /** The native host answered but runs an older version. */
    outdated: boolean;
    /** Null when the backend is not in use. */
    route: RouteLabel | null;
    firstForImages: boolean;
  }

  const {
    kind,
    beStatus,
    supportsImage,
    verifiedAt,
    testFailed,
    outdated,
    route,
    firstForImages,
  }: Props = $props();

  type Pill = {
    word: string;
    variant: 'default' | 'success' | 'warning' | 'danger' | 'muted';
    icon: typeof Check;
  };

  /** Badge's icon size; each sizer leaves room for it and the gap, so the face centers whole. */
  const PILL_ICON = 14;
  const CHECKING: Pill = { word: 'Checking...', variant: 'muted', icon: LoaderCircle };
  /** Every pill a kind can show, after Checking.... */
  const PILLS = {
    cloud: {
      setup: { word: 'Needs setup', variant: 'warning', icon: AlertTriangle },
      failed: { word: 'Test failed', variant: 'danger', icon: CircleX },
      verified: { word: 'Verified', variant: 'success', icon: Check },
      saved: { word: 'Key saved', variant: 'default', icon: KeyRound },
    },
    native: {
      missing: { word: 'Not installed', variant: 'danger', icon: CircleX },
      outdated: { word: 'Update needed', variant: 'warning', icon: AlertTriangle },
      installed: { word: 'Installed', variant: 'success', icon: Check },
    },
    local: {
      running: { word: 'Running', variant: 'success', icon: Check },
      stopped: { word: 'Not running', variant: 'danger', icon: CircleX },
    },
  } satisfies Record<BackendKind, Record<string, Pill>>;

  const pill = $derived.by((): Pill => {
    if (beStatus === 'unknown') return CHECKING;
    if (kind === 'cloud') {
      if (beStatus === 'needs-config') return PILLS.cloud.setup;
      if (testFailed) return PILLS.cloud.failed;
      if (verifiedAt !== null) return PILLS.cloud.verified;
      return PILLS.cloud.saved;
    }
    if (kind === 'native') {
      if (beStatus !== 'ready') return PILLS.native.missing;
      return outdated ? PILLS.native.outdated : PILLS.native.installed;
    }
    return beStatus === 'ready' ? PILLS.local.running : PILLS.local.stopped;
  });
  // Every pill of every kind holds the widest word's width, so a state change moves nothing and the cards' pills match (R63).
  const WORDS = [CHECKING, ...Object.values(PILLS).flatMap((k) => Object.values<Pill>(k))].map(
    (p) => p.word,
  );

  function ago(at: number): string {
    const minutes = Math.round((Date.now() - at) / 60_000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 48) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
    const days = Math.round(hours / 24);
    return `${days} days ago`;
  }

  const routeText = $derived.by((): string | null => {
    if (route === null) return null;
    switch (route.kind) {
      case 'first':
        return 'First choice';
      case 'backup':
        return `Backup ${route.n}`;
      case 'skipped':
        return 'Skipped';
      case 'unknown':
        return 'Checking...';
    }
  });
</script>

{#if !supportsImage}<span class="be-text-only">Text only</span>{/if}
<span class="be-pill" data-ega-backend-status={pill.word} style:--be-pill-icon="{PILL_ICON}px">
  <Badge variant={pill.variant}>
    <!-- Icon and word center as one face over hidden sizers; data-label keeps those out of the text. -->
    <span class="ega-stable">
      <span class="be-pill-face"
        ><span class="be-pill-icon" aria-hidden="true"
          ><pill.icon size={PILL_ICON} strokeWidth={2} /></span
        >{pill.word}{#if pill.word === 'Verified' && verifiedAt !== null}<span class="ega-sr-only"
            >{` ${ago(verifiedAt)}`}</span
          >{/if}</span
      >
      {#each WORDS as w (w)}<span class="be-pill-sizer" aria-hidden="true" data-label={w}
        ></span>{/each}
    </span>
  </Badge>
</span>
{#if routeText !== null}
  <span
    class="be-route"
    class:first={route?.kind === 'first'}
    class:quiet={route?.kind !== 'first' && route?.kind !== 'backup'}
    data-ega-route={route?.kind}>{routeText}</span
  >
{/if}
{#if firstForImages}
  <span class="be-route" data-ega-route="first-for-images">First for images</span>
{/if}

<style>
  .be-text-only {
    font-size: var(--fs-base);
    color: var(--color-muted);
  }
  .be-pill {
    display: inline-flex;
  }
  .be-pill-face,
  .be-pill-icon {
    display: inline-flex;
    align-items: center;
  }
  .be-pill-face {
    gap: var(--space-1);
  }
  .be-pill-sizer {
    padding-inline-start: calc(var(--be-pill-icon) + var(--space-1));
  }
  .be-route {
    font-size: var(--fs-base);
    color: var(--color-fg);
    white-space: nowrap;
  }
  .be-route.first {
    color: var(--color-accent-hover);
    font-weight: 600;
  }
  .be-route.quiet {
    color: var(--color-muted);
  }
</style>
