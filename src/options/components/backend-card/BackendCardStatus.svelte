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

  const pill = $derived.by((): Pill => {
    if (beStatus === 'unknown')
      return { word: 'Checking...', variant: 'muted', icon: LoaderCircle };
    if (kind === 'cloud') {
      if (beStatus === 'needs-config')
        return { word: 'Needs setup', variant: 'warning', icon: AlertTriangle };
      if (testFailed) return { word: 'Test failed', variant: 'danger', icon: CircleX };
      if (verifiedAt !== null) return { word: 'Verified', variant: 'success', icon: Check };
      return { word: 'Key saved', variant: 'default', icon: KeyRound };
    }
    if (kind === 'native') {
      if (beStatus !== 'ready') return { word: 'Not installed', variant: 'danger', icon: CircleX };
      return outdated
        ? { word: 'Update needed', variant: 'warning', icon: AlertTriangle }
        : { word: 'Installed', variant: 'success', icon: Check };
    }
    return beStatus === 'ready'
      ? { word: 'Running', variant: 'success', icon: Check }
      : { word: 'Not running', variant: 'danger', icon: CircleX };
  });

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
      case 'not-reached':
        return 'Not reached';
      case 'skipped':
        return 'Skipped';
      case 'unknown':
        return 'Checking...';
    }
  });
</script>

{#if !supportsImage}<span class="be-text-only">Text only</span>{/if}
<span class="be-pill" data-ega-backend-status={pill.word}>
  <Badge variant={pill.variant} icon={pill.icon}>
    {pill.word}{#if pill.word === 'Verified' && verifiedAt !== null}<span class="ega-sr-only"
        >{` ${ago(verifiedAt)}`}</span
      >{/if}
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
