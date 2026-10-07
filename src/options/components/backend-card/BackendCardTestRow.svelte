<script lang="ts">
  /** "Test now" and what it found: how fast it answered, or a plain error with the backend's own words under Details. */
  import type { BackendId } from '@/shared/types';
  import Button from '@/shared/ui/Button.svelte';
  import Disclosure from '@/options/components/Disclosure.svelte';
  import OllamaOriginSteps from './OllamaOriginSteps.svelte';
  import InlineSpinner from '../InlineSpinner.svelte';
  import { errorCopy, type ErrorCopyId } from '@/shared/error-copy';
  import { backendLabel } from '@/shared/backends/provider-profiles';

  interface Props {
    id: BackendId;
    testRunning: boolean;
    testSucceeded: boolean;
    /** The answer text on success; the backend's own message on failure. */
    testResult: string | null;
    /** The error code of a failed test; null when it passed or ran nothing. */
    testErrCode: string | null;
    /** A plain line that is neither a pass nor a failure. */
    testNote?: string | null;
    testLatencyMs: number | null;
    /** Ollama-only model-load note after a successful test of 5 s or more. */
    slowFirstShotNote?: string | null;
    ollama403: boolean;
    /** The value OLLAMA_ORIGINS must hold for Ega, for the 403 steps. */
    ollamaOrigin?: string;
    onTest: () => void;
  }

  const {
    id,
    testRunning,
    testSucceeded,
    testResult,
    testErrCode,
    testNote = null,
    testLatencyMs,
    slowFirstShotNote = null,
    ollama403,
    ollamaOrigin = '',
    onTest,
  }: Props = $props();

  const seconds = (ms: number): string =>
    ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.max(1, Math.round(ms))} ms`;

  const failure = $derived(
    !testSucceeded && testResult !== null && !testRunning
      ? errorCopy(testErrCode ?? 'UNKNOWN', testResult, { backend: backendLabel(id) })
      : null,
  );

  // The catalog keeps the fix in buttons this row does not show; on the card the fix is a field close by (R39).
  const local = $derived(id === 'ollama' || id === 'localserver');
  const NEXT_STEP: Partial<Record<ErrorCopyId, string>> = {
    AUTH: 'Check the key above, then test again.',
    TIMEOUT: 'Test again, or raise Text answer timeout under Timeouts and checks.',
    RATE_LIMIT: 'Wait a minute, then test again.',
    SERVER: 'Try again in a moment.',
    REQUEST_MODEL: 'Pick another model above, then test again.',
    REQUEST: 'Try another model above.',
    UNSUPPORTED: 'Pick another model above.',
    NATIVE_NOT_INSTALLED: 'Follow the install steps above, then click Recheck.',
    NATIVE_SPAWN_FAIL: 'Check that the CLI is installed and logged in, then test again.',
    NO_BACKEND: 'Add an API key above, then test again.',
    PARSE: "Test again. If it repeats, Details has the backend's message.",
    PROTOCOL: 'Test again.',
    EMPTY: 'Test again.',
    UNKNOWN: "Test again. If it repeats, Details has the backend's message.",
  };
  const nextStep = $derived(
    failure === null
      ? null
      : failure.id === 'NETWORK'
        ? local
          ? 'Check that it is running at the address above, then test again.'
          : 'Check your network, then test again.'
        : (NEXT_STEP[failure.id] ?? null),
  );
</script>

<div class="be-test" data-ega-backend-test={id}>
  <div class="be-test-row">
    <!-- Not the shared `loading`: it hides the label and drops focus; the spec wants a spinner and "Testing...". -->
    <Button
      variant="secondary"
      ariaDisabled={testRunning}
      dataAttrs={{ 'data-testid': `backend-card-test-${id}` }}
      onclick={onTest}
      >{#if testRunning}<InlineSpinner />Testing...{:else}Test now{/if}</Button
    >
    <span class="be-test-status" role="status" aria-live="polite">
      {#if testSucceeded && testLatencyMs !== null}
        <span class="be-latency">Answered in {seconds(testLatencyMs)}</span>
      {/if}
    </span>
  </div>
  {#if testSucceeded && testResult}
    <p class="be-testresult" data-ega-test-answer>{testResult}</p>
  {/if}
  {#if testNote}
    <p class="be-test-note" data-ega-test-note>{testNote}</p>
  {/if}
  {#if slowFirstShotNote}
    <p class="be-test-note">{slowFirstShotNote}</p>
  {/if}

  {#if ollama403}
    <div class="be-fail" role="alert" data-testid="ollama-403-help">
      <p class="be-fail-title">Ollama blocked the request from Ega</p>
      <Disclosure label="Show steps">
        <OllamaOriginSteps origin={ollamaOrigin} />
      </Disclosure>
    </div>
  {:else if failure}
    <div class="be-fail" role="alert" data-ega-test-failure={failure.id}>
      <p class="be-fail-title">{failure.title}</p>
      <p class="be-fail-text">{failure.body}</p>
      {#if nextStep}<p class="be-fail-text" data-ega-test-next>{nextStep}</p>{/if}
      {#if failure.detail}
        <Disclosure label="Details">
          <p class="be-testresult be-detail">
            {failure.detail}{#if testErrCode}<br /><span class="be-code">Code: {testErrCode}</span
              >{/if}
          </p>
        </Disclosure>
      {/if}
    </div>
  {/if}
</div>

<style>
  .be-test {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .be-test-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2) var(--space-3);
  }
  .be-latency,
  .be-test-note {
    margin: 0;
    font-size: var(--fs-base);
    color: var(--color-muted);
    font-variant-numeric: tabular-nums;
  }
  .be-testresult {
    margin: 0;
    font-size: var(--fs-base);
    line-height: var(--lh-body);
    overflow-wrap: anywhere;
  }
  .be-fail {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .be-fail-title {
    margin: 0;
    font-size: var(--fs-base);
    font-weight: 600;
    color: var(--color-danger-fg);
  }
  .be-fail-text {
    margin: 0;
    max-inline-size: 80ch;
    font-size: var(--fs-base);
    line-height: var(--lh-body);
  }
  .be-detail {
    font-family: var(--font-mono);
    font-size: var(--fs-sm);
    color: var(--color-muted);
  }
  .be-code {
    font-family: var(--font-mono);
  }
</style>
