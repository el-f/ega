<script lang="ts">
  type Status = 'unknown' | 'ready' | 'needs-config' | 'unavailable';

  interface Props {
    beStatus: Status;
    supportsImage: boolean;
    routeIsText: boolean;
    routeIsImage: boolean;
    /** An API-key backend is only "ready" because a key is stored; it is Verified once Test passes. */
    keyOnly?: boolean;
    verified?: boolean;
  }

  const {
    beStatus,
    supportsImage,
    routeIsText,
    routeIsImage,
    keyOnly = false,
    verified = false,
  }: Props = $props();

  const saved = $derived(beStatus === 'ready' && keyOnly && !verified);
  const label = $derived(
    saved
      ? 'Key saved'
      : beStatus === 'ready'
        ? keyOnly
          ? 'Verified'
          : 'Ready'
        : beStatus === 'needs-config'
          ? 'Needs setup'
          : beStatus === 'unavailable'
            ? 'Unavailable'
            : 'Checking…',
  );

  // The visible tag is hidden from screen readers; this text names the route.
  const routeSummary = $derived(
    [routeIsText ? 'text' : null, routeIsImage ? 'images' : null].filter(Boolean).join(' and '),
  );
</script>

<span class="be-dot be-dot-{saved ? 'saved' : beStatus}" aria-hidden="true"></span>
<span class="be-status be-status-{saved ? 'saved' : beStatus}">{label}</span>
{#if !supportsImage}
  <span class="be-tag" title="This backend does not support image translation">text-only</span>
{/if}
{#if routeSummary}
  <span class="be-tag be-tag-first" aria-hidden="true"
    >{routeIsText ? 'First choice' : 'First for images'}</span
  >
  <span class="ega-sr-only">First choice for {routeSummary}</span>
{/if}

<style>
  .be-tag {
    font-size: var(--fs-xs);
    padding: 1px 6px;
    border-radius: 999px;
    background: var(--color-bg-elevated);
    color: var(--color-muted);
    border: 1px solid var(--color-border);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .be-dot {
    width: 9px;
    height: 9px;
    border-radius: 999px;
    display: inline-block;
    background: var(--color-dot-idle);
    margin-right: 6px;
    vertical-align: middle;
  }
  .be-dot-ready {
    background: var(--color-success-fg);
    box-shadow: 0 0 6px rgba(86, 211, 100, 0.55);
    animation: be-ready-pulse 2.4s ease-in-out infinite;
  }
  @keyframes be-ready-pulse {
    0%,
    100% {
      box-shadow: 0 0 6px rgba(86, 211, 100, 0.55);
    }
    50% {
      box-shadow: 0 0 10px rgba(86, 211, 100, 0);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .be-dot-ready {
      animation-duration: 0.01ms;
    }
  }
  .be-dot-needs-config {
    background: var(--color-warning-fg);
  }
  .be-dot-unavailable {
    background: var(--color-danger);
  }
  .be-dot-saved {
    background: var(--color-muted);
  }
  .be-dot-unknown {
    background: var(--color-muted);
  }
  .be-status {
    font-size: var(--fs-xs);
    padding: 1px 8px;
    border-radius: 999px;
    border: 1px solid var(--color-border);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .be-status-ready {
    background: rgba(86, 211, 100, 0.12);
    color: var(--color-success-fg);
    border-color: var(--color-success);
  }
  .be-status-needs-config {
    background: rgba(227, 179, 65, 0.12);
    color: var(--color-warning-fg);
    border-color: var(--color-warning-border);
  }
  /* danger-fg, not danger: #e5484d on the tinted dark pill is ~4:1 — below AA for 11px text. */
  .be-status-unavailable {
    background: rgba(248, 81, 73, 0.1);
    color: var(--color-danger-fg);
    border-color: var(--color-danger);
  }
  .be-status-saved,
  .be-status-unknown {
    color: var(--color-muted);
  }
  .be-tag-first {
    margin-right: 6px;
    text-transform: none;
    letter-spacing: 0;
    color: var(--color-accent);
    border-color: var(--color-accent);
  }
</style>
