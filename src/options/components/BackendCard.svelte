<script lang="ts">
  import type { Settings, BackendId } from '@/shared/types';
  import { asLangIdUnsafe, asLangPresetIdUnsafe } from '@/shared/brands';
  import { backendNeedsKey, backendHasRequiredKey } from '@/shared/backends/key-presence';
  import { resolveBackend } from '@/shared/backends/registry';
  import { apiKeyField } from '@/shared/provider-ids';
  import {
    parseJsonResponse,
    type BackendConfig,
    type TranslationBackend,
  } from '@/shared/backends/base';
  import { createThinkScrubber } from '@/shared/backends/think-scrubber';
  import { probeNativeHost } from '../probeNativeHost';
  import { createCancelToken } from '@/shared/cancel-token';
  import { DEFAULT_TRANSLATE_TIMEOUT_MS } from '@/shared/constants';
  import { sendMsg } from '@/shared/messages';
  import type { Snippet } from 'svelte';
  import CollapsibleCard from '@/shared/components/CollapsibleCard.svelte';
  import { assertNever } from '@/shared/invariants';
  import { errCodeLabel } from '@/shared/err-labels';
  import BackendCardStatus from '@/options/components/backend-card/BackendCardStatus.svelte';
  import BackendCardTestRow from '@/options/components/backend-card/BackendCardTestRow.svelte';
  import { buildBackendConfig } from '@/shared/backends/build-config';
  import { requestAuditEntry } from '@/shared/audit-log';
  import { resolveModelId } from '@/shared/settings-schema';

  const TEST_PROMPT_TEXT = 'marhaba ya habibi kif halak el yom, kol shi tamam?';
  const TEST_SYSTEM_PROMPT =
    'Translate the user message into English. Reply with the translation only — no preamble, no JSON, no markdown.';

  interface Props {
    /** Backend id (matches the registry). Used to label + dispatch test calls. */
    id: BackendId;
    label: string;
    /** Current Settings snapshot, used to build a fresh BackendConfig for probes. */
    settings: Settings;
    /** Provider-specific config inputs (API key field, URL, model, etc). */
    children?: Snippet;
    /** True when this backend is the resolved winner for the text route. */
    routeIsText?: boolean;
    /** True when this backend is the resolved winner for the image route. */
    routeIsImage?: boolean;
  }

  let {
    id,
    label,
    settings,
    children,
    routeIsText = false,
    routeIsImage = false,
  }: Props = $props();

  type Status = 'unknown' | 'ready' | 'needs-config' | 'unavailable';
  let beStatus = $state<Status>('unknown');
  let testRunning = $state(false);
  let testSucceeded = $state(false);
  let testResult: string | null = $state(null);
  let testLatencyMs: number | null = $state(null);
  let testPrefillMs: number | null = $state(null);
  let testDecodeMs: number | null = $state(null);

  // Closed until the user (or a jump from the welcome banner) opens it; a wall of open cards hides the one that matters.
  let open = $state(false);

  const ollama403 = $derived(
    id === 'ollama' &&
      testResult !== null &&
      (/\b403\b/.test(testResult) || /OLLAMA_ORIGINS/.test(testResult)),
  );
  const testLatencyLabel = $derived(
    testLatencyMs === null
      ? null
      : testLatencyMs >= 1000
        ? `${(testLatencyMs / 1000).toFixed(1)}s`
        : `${testLatencyMs}ms`,
  );
  const latencyTone = $derived<'fast' | 'normal' | 'slow' | null>(
    testLatencyMs === null
      ? null
      : testLatencyMs < 500
        ? 'fast'
        : testLatencyMs > 2000
          ? 'slow'
          : 'normal',
  );
  const slowFirstShotNote = $derived.by<string | null>(() => {
    if (id !== 'ollama' && id !== 'localserver') return null;
    if (testLatencyMs === null || testLatencyMs < 5000) return null;
    if (!testSucceeded) return null;
    return 'Connected. First run after idle is usually the slowest while the model loads.';
  });
  const supportsImage = $derived(!!resolveBackend(id)?.translateImage);

  // Only the fields this backend's isAvailable reads.
  const probeKey = $derived(
    [
      // The key itself, not its presence: a passed Test must not carry over to a different key.
      backendNeedsKey(id) ? (settings[apiKeyField(id)] ?? '') : '',
      id === 'ollama' ? (settings.ollamaUrl ?? '') : '',
      id === 'localserver' ? (settings.localServerUrl ?? '') : '',
      id === 'ollama' || id === 'localserver' || id === 'native'
        ? String(settings.localBackendTimeoutMs ?? '')
        : '',
    ].join('\x00'),
  );
  // Native pings on a one-shot port: this page's own port-manager copy would keep a host alive until the tab closes.
  function checkAvailable(
    backend: TranslationBackend,
    cfg: BackendConfig,
    fresh = false,
  ): Promise<boolean> {
    if (id !== 'native') return backend.isAvailable(cfg);
    return probeNativeHost(settings.localBackendTimeoutMs, { fresh }).then(
      (r) => r.status === 'installed' || r.status === 'outdated',
    );
  }

  // The effect body reads the whole snapshot, so probeKey is what stops a re-probe.
  let lastProbeKey: string | null = null;
  // An older, slower probe must not overwrite a newer status.
  let probeGen = 0;
  $effect(() => {
    const key = probeKey;
    if (key === lastProbeKey) return;
    lastProbeKey = key;
    // A passed Test belongs to the key it ran with.
    testSucceeded = false;
    const backend = resolveBackend(id);
    if (!backend) {
      beStatus = 'unavailable';
      return;
    }
    const myGen = ++probeGen;
    const cfg = buildBackendConfig(settings);
    void checkAvailable(backend, cfg)
      .then((ok) => {
        if (myGen !== probeGen) return;
        if (ok) {
          beStatus = 'ready';
        } else if (backendNeedsKey(id) && !backendHasRequiredKey(id, settings)) {
          beStatus = 'needs-config';
        } else {
          beStatus = 'unavailable';
        }
      })
      .catch(() => {
        if (myGen === probeGen) beStatus = 'unavailable';
      });
  });

  async function runTest(): Promise<void> {
    testRunning = true;
    try {
      testSucceeded = false;
      testResult = null;
      testLatencyMs = null;
      testPrefillMs = null;
      testDecodeMs = null;
      const backend = resolveBackend(id);
      if (!backend) {
        testResult = 'Backend not registered';
        return;
      }
      const cfg = buildBackendConfig(settings);
      // Test re-probes first: external state (OLLAMA_ORIGINS, a stopped server) changes without Settings changing.
      const probeStart = performance.now();
      let available: boolean;
      try {
        available = await checkAvailable(backend, cfg, true);
      } catch {
        available = false;
      }
      // A local server's own request error names the address and the fix, so it runs even when the probe failed.
      if (!available && id !== 'ollama' && id !== 'localserver') {
        beStatus =
          backendNeedsKey(id) && !backendHasRequiredKey(id, settings)
            ? 'needs-config'
            : 'unavailable';
        testLatencyMs = Math.round(performance.now() - probeStart);
        testResult =
          id === 'native'
            ? 'The native host did not answer. Follow the install steps above, then click Recheck.'
            : 'Cannot reach this backend. Check the API key, the URL or the local server above.';
        return;
      }
      beStatus = available ? 'ready' : 'unavailable';
      const testCfg: BackendConfig = cfg;
      const start = performance.now();
      const auditTest = (response: string, error?: { code: string; message: string }): void => {
        requestAuditEntry({
          task: 'backend-test',
          sourceLang: 'arabizi',
          targetLang: 'en',
          backend: id,
          model: resolveModelId(testCfg.model, id),
          systemPrompt: TEST_SYSTEM_PROMPT,
          userPrompt: TEST_PROMPT_TEXT,
          response,
          latencyMs: Math.round(performance.now() - start),
          cacheHit: false,
          ...(error ? { error } : {}),
        });
      };
      // Native goes through the SW so the CLI subprocess lands in the port manager the chip polls.
      if (id === 'native') {
        const probeMs = Math.round(performance.now() - probeStart);
        const text = TEST_PROMPT_TEXT;
        const timeoutMs = settings.translateTimeoutMs ?? DEFAULT_TRANSLATE_TIMEOUT_MS;
        const ask = sendMsg({
          kind: 'native:test',
          cfg: testCfg,
          text,
          sourceLang: 'arabizi',
          targetLang: 'en',
          timeoutMs,
        }).catch(() => undefined);
        // An evicted worker answers nothing at all, so the SW's own budget cannot end this wait.
        const reply = await Promise.race([
          ask,
          new Promise<undefined>((r) => setTimeout(() => r(undefined), timeoutMs + 5_000)),
        ]);
        const total = reply?.totalMs ?? Math.round(performance.now() - start);
        testLatencyMs = total;
        // Prefill here is the availability ping: the host boots but no CLI spawns yet.
        testPrefillMs = probeMs;
        testDecodeMs =
          reply?.firstDeltaMs !== undefined ? Math.max(0, total - reply.firstDeltaMs) : null;
        if (reply?.ok) {
          const parsed = parseJsonResponse(reply.result ?? '');
          testResult = parsed.translation.trim().slice(0, 200) || '(empty result)';
          testSucceeded = true;
          auditTest(testResult);
        } else {
          testResult =
            reply?.error ?? 'No answer from the native host. Click Recheck above, then test again.';
          auditTest('', { code: reply?.code ?? 'UNKNOWN', message: testResult });
        }
        return;
      }
      let firstDeltaAt: number | null = null;
      let accumulated = '';
      let done = false;
      let errMsg: string | null = null;
      let errCode: string | null = null;
      try {
        await backend.translate({
          req: {
            id: `test-${Date.now()}`,
            text: TEST_PROMPT_TEXT,
            sourceLang: asLangPresetIdUnsafe('arabizi'),
            targetLang: asLangIdUnsafe('en'),
            options: { stream: false, explain: false },
          },
          system: TEST_SYSTEM_PROMPT,
          user: TEST_PROMPT_TEXT,
          stream: false,
          cancel: createCancelToken(
            AbortSignal.timeout(settings.translateTimeoutMs ?? DEFAULT_TRANSLATE_TIMEOUT_MS),
          ).token,
          config: testCfg,
          onChunk: (c) => {
            if (c.type === 'delta') {
              if (firstDeltaAt === null) firstDeltaAt = performance.now();
              accumulated += c.text;
            } else if (c.type === 'done') done = true;
            else if (c.type === 'error') {
              errCode = c.code;
              errMsg = `${errCodeLabel(c.code)}: ${c.message}`;
            } else assertNever(c);
          },
        });
      } catch (e) {
        errMsg = (e as Error).message;
      }
      const endAt = performance.now();
      testLatencyMs = Math.round(endAt - start);
      // Prefill = start to first delta (model load + prompt); decode = first delta to done.
      testPrefillMs = firstDeltaAt === null ? null : Math.round(firstDeltaAt - start);
      testDecodeMs = firstDeltaAt === null ? null : Math.round(endAt - firstDeltaAt);
      if (errMsg) {
        testResult = errMsg;
        auditTest('', { code: errCode ?? 'UNKNOWN', message: errMsg });
      } else if (done) {
        // The model may answer with JSON even though the prompt asks for plain text.
        const scrub = createThinkScrubber();
        const parsed = parseJsonResponse(scrub.push(accumulated) + scrub.flush());
        testResult = parsed.translation.trim().slice(0, 200) || '(empty result)';
        testSucceeded = true;
        auditTest(testResult);
      } else {
        testResult = '(no output)';
        auditTest('', { code: 'UNKNOWN', message: 'no output' });
      }
    } finally {
      testRunning = false;
    }
  }
</script>

<div class="backend-card-wrap">
  <CollapsibleCard bind:open title={label} backendId={id}>
    {#snippet status()}
      <BackendCardStatus
        {beStatus}
        {supportsImage}
        {routeIsText}
        {routeIsImage}
        keyOnly={backendNeedsKey(id)}
        verified={testSucceeded}
      />
    {/snippet}

    <div class="be-body">
      {#if children}{@render children()}{/if}
    </div>

    <BackendCardTestRow
      {id}
      {settings}
      {beStatus}
      {testRunning}
      {testSucceeded}
      {testResult}
      {testLatencyMs}
      {testPrefillMs}
      {testDecodeMs}
      {slowFirstShotNote}
      {testLatencyLabel}
      {latencyTone}
      {ollama403}
      onTest={runTest}
    />
  </CollapsibleCard>
</div>

<style>
  .backend-card-wrap {
    /* Spacing belongs to the parent grid's gap — a margin here stacks with it. */
    margin: 0;
  }
  .be-body {
    margin: 6px 0 var(--space-3);
  }
</style>
