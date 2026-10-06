<script lang="ts">
  import type { Settings, BackendId } from '@/shared/types';
  import { backendNeedsKey, backendHasRequiredKey } from '@/shared/backends/key-presence';

  type Status = 'unknown' | 'ready' | 'needs-config' | 'unavailable';

  interface Props {
    id: BackendId;
    settings: Settings;
    beStatus: Status;
    testRunning: boolean;
    testSucceeded: boolean;
    testResult: string | null;
    testLatencyMs: number | null;
    testPrefillMs: number | null;
    testDecodeMs: number | null;
    /** Ollama-only model-load note after a successful test of 5 s or more (BackendCard); non-null also forces the slow tone. */
    slowFirstShotNote?: string | null;
    /** Pre-formatted latency label (`"1.2s"` / `"840ms"`). */
    testLatencyLabel: string | null;
    /** Three-tier health tone derived from `testLatencyMs`. Drives the pill
     *  coloring: fast <500ms, normal 500–2000ms, slow >2000ms. */
    latencyTone?: 'fast' | 'normal' | 'slow' | null;
    ollama403: boolean;
    onTest: () => void;
  }

  import { tick } from 'svelte';

  const {
    id,
    settings,
    beStatus,
    testRunning,
    testSucceeded,
    testResult,
    testLatencyMs,
    testPrefillMs,
    testDecodeMs,
    slowFirstShotNote = null,
    testLatencyLabel,
    latencyTone = null,
    ollama403,
    onTest,
  }: Props = $props();

  // Colored tiers also carry a word, so the color is not the only signal.
  const tierWord = $derived(
    slowFirstShotNote || latencyTone === 'slow' ? 'slow' : latencyTone === 'fast' ? 'fast' : null,
  );

  // Single source of truth for the disabled state so the button's
  // `disabled` and the reason shown in `title`/aria can't drift apart.
  const missingKey = $derived(backendNeedsKey(id) && !backendHasRequiredKey(id, settings));
  const isDisabled = $derived(testRunning || missingKey);
  const disabledReason = $derived(
    missingKey
      ? 'Add an API key above, then Test'
      : beStatus === 'unavailable'
        ? 'Test now checks again — click after fixing the setup above'
        : '',
  );

  // Tracks the previous value so the keyframe replays on every fresh test, not only the first.
  let justSucceeded = $state(false);
  let prevSucceeded = false;
  let popTimer: ReturnType<typeof setTimeout> | null = null;
  $effect(() => {
    const next = testSucceeded;
    // The tick() continuation outlives the effect run, so teardown latches it off.
    let cancelled = false;
    if (next && !prevSucceeded) {
      justSucceeded = false;
      void tick().then(() => {
        if (cancelled) return;
        justSucceeded = true;
        popTimer = setTimeout(() => {
          justSucceeded = false;
          popTimer = null;
        }, 600);
      });
    }
    prevSucceeded = next;
    return () => {
      cancelled = true;
      if (popTimer) {
        clearTimeout(popTimer);
        popTimer = null;
      }
    };
  });
</script>

<div class="be-actions row">
  <button
    type="button"
    class="be-test-btn"
    class:is-hot={testSucceeded}
    data-just-succeeded={justSucceeded ? '' : undefined}
    onclick={onTest}
    disabled={isDisabled}
    data-testid="backend-card-test-{id}"
    title={disabledReason}
    aria-label={disabledReason ? `Test now — ${disabledReason}` : undefined}
  >
    {testRunning ? 'Testing…' : testSucceeded ? 'Tested ✓' : 'Test now'}
  </button>
  {#if missingKey}
    <span class="be-disabled-reason">{disabledReason}</span>
  {/if}
  {#if testLatencyMs !== null}
    <span
      class="be-latency"
      class:be-latency-fast={tierWord === 'fast'}
      class:be-latency-slow={tierWord === 'slow'}
    >
      {testLatencyLabel}{#if tierWord}&nbsp;· {tierWord}{/if}
    </span>
    {#if testPrefillMs !== null && testDecodeMs !== null}
      <span
        class="be-latency-breakdown"
        title="First token = response start. Generation = streaming the rest."
      >
        ({testPrefillMs}ms first token · {testDecodeMs}ms generation)
      </span>
    {/if}
  {/if}
  {#if testResult}
    <span class="be-testresult">{testResult}</span>
  {/if}
  {#if slowFirstShotNote}
    <span class="be-test-note">{slowFirstShotNote}</span>
  {/if}
</div>

{#if ollama403}
  <aside class="be-help" role="note" data-testid="ollama-403-help">
    <strong>Ollama CORS setup</strong>
    <p>
      Ollama rejects the extension's <code>chrome-extension://</code> origin by default. Open the
      Ollama card's <b>Extension access</b> section for Ega's exact origin string and the per-OS commands.
    </p>
    <p>
      <b>Do not use <code>"*"</code> or <code>"chrome-extension://*"</code></b> — they let any website
      or any installed extension reach your local Ollama. Use the exact origin shown under Extension access.
    </p>
    <p>
      See
      <a
        href="https://github.com/ollama/ollama/blob/main/docs/faq.md"
        target="_blank"
        rel="noopener noreferrer">Ollama FAQ</a
      >
      for details.
    </p>
  </aside>
{/if}

<style>
  /* bg-hover, not bg-sunken: bg-sunken collapses onto the card's bg-elevated in light theme and the band disappears. */
  .be-actions {
    margin: var(--space-3) 0 0;
    padding: var(--space-2) var(--space-3);
    border-top: 1px solid var(--color-border-subtle);
    background: var(--color-bg-hover);
    border-radius: var(--radius-sm);
  }
  /* Full-bleed footer when nothing follows the row in the parent. */
  .be-actions:last-child {
    margin: var(--space-3) calc(-1 * var(--space-3)) calc(-1 * var(--space-3));
    border-radius: 0 0 var(--radius-md) var(--radius-md);
  }
  .be-test-btn {
    transition:
      background var(--motion-fast) var(--ease-out),
      border-color var(--motion-fast) var(--ease-out),
      color var(--motion-fast) var(--ease-out),
      box-shadow var(--motion-fast) var(--ease-out),
      transform var(--motion-fast) var(--ease-out);
  }
  .be-test-btn.is-hot {
    background: rgba(70, 167, 88, 0.16);
    border-color: var(--color-success);
    color: var(--color-success-fg);
    box-shadow:
      0 0 0 1px rgba(70, 167, 88, 0.16),
      0 10px 26px rgba(70, 167, 88, 0.18);
    transform: translateY(-1px);
  }
  .be-test-btn.is-hot:hover:not(:disabled) {
    background: rgba(70, 167, 88, 0.22);
  }
  /* `data-just-succeeded` holds for ~600ms, so the bloom decays back to the resting shadow instead of looping. */
  @keyframes be-test-success-pop {
    0% {
      box-shadow:
        0 0 0 6px rgba(70, 167, 88, 0.28),
        0 10px 26px rgba(70, 167, 88, 0.18);
    }
    100% {
      box-shadow:
        0 0 0 1px rgba(70, 167, 88, 0.16),
        0 10px 26px rgba(70, 167, 88, 0.18);
    }
  }
  .be-test-btn.is-hot[data-just-succeeded] {
    animation: be-test-success-pop 500ms var(--ease-out, ease-out) 1;
  }
  @media (prefers-reduced-motion: reduce) {
    .be-test-btn.is-hot[data-just-succeeded] {
      animation: none;
    }
  }
  /* The same text the title and aria carry, shown so a mouse user does not have to hover to learn why. */
  .be-disabled-reason {
    font-size: var(--fs-sm);
    color: var(--color-muted);
  }
  .be-latency {
    font-size: var(--fs-sm);
    opacity: 0.75;
    font-variant-numeric: tabular-nums;
    padding: 0 6px;
    border-radius: var(--radius-pill);
    border: 1px solid transparent;
  }
  .be-latency-fast {
    color: var(--color-success-fg);
    background: var(--color-success-bg-soft);
    border-color: var(--color-success);
    opacity: 1;
  }
  .be-latency-slow {
    color: var(--color-warning-fg);
    background: var(--color-warning-bg-soft);
    border-color: var(--color-warning-border);
    opacity: 1;
  }
  .be-latency-breakdown {
    font-size: var(--fs-xs);
    color: var(--color-muted);
    font-variant-numeric: tabular-nums;
    margin-left: var(--space-1);
  }
  .be-testresult {
    font-size: var(--fs-sm);
    opacity: 0.9;
    flex: 1;
    min-width: 200px;
    overflow-wrap: anywhere;
  }
  .be-test-note {
    flex-basis: 100%;
    font-size: var(--fs-sm);
    color: var(--color-muted);
  }
  .be-help {
    margin-top: 10px;
    padding: 10px 12px;
    border: 1px solid var(--color-warning-border);
    border-radius: 6px;
    background: rgba(227, 179, 65, 0.08);
    font-size: var(--fs-sm);
    line-height: 1.45;
  }
  .be-help strong {
    display: block;
    font-size: var(--fs-sm);
    margin-bottom: 4px;
    color: var(--color-warning-fg);
  }
  .be-help p {
    margin: 4px 0;
  }
  .be-help code {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: var(--fs-sm);
  }
</style>
