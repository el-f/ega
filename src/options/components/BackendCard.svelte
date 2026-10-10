<script lang="ts">
  import type { Settings, BackendId } from '@/shared/types';
  import { asLangIdUnsafe, asLangPresetIdUnsafe } from '@/shared/brands';
  import { backendNeedsKey, backendHasRequiredKey } from '@/shared/backends/key-presence';
  import { resolveBackend } from '@/shared/backends/registry';
  import { apiKeyField } from '@/shared/provider-ids';
  import type { BackendConfig, TranslationBackend } from '@/shared/backends/base';
  import { readAnswer } from '@/shared/answer/reader';
  import { answerSpecFor } from '@/shared/answer/spec';
  import { createThinkScrubber } from '@/shared/backends/think-scrubber';
  import { probeNativeHost } from '../probeNativeHost';
  import { onNativeProbe } from '../native-probe-events';
  import { createCancelToken } from '@/shared/cancel-token';
  import { DEFAULT_TRANSLATE_TIMEOUT_MS } from '@/shared/constants';
  import { sendMsg } from '@/shared/messages';
  import type { Snippet } from 'svelte';
  import CollapsibleCard from '@/shared/components/CollapsibleCard.svelte';
  import { assertNever } from '@/shared/invariants';
  import BackendCardStatus from '@/options/components/backend-card/BackendCardStatus.svelte';
  import { getBackendRouteContext } from '@/options/backend-route-context';
  import { clearVerified, markVerified, readVerified } from '@/options/backend-verified';
  import BackendCardTestRow from '@/options/components/backend-card/BackendCardTestRow.svelte';
  import { buildBackendConfig } from '@/shared/backends/build-config';
  import { requestAuditEntry } from '@/shared/audit-log';
  import { lookupModelId, resolveModelId } from '@/shared/settings-schema';

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
  }

  let { id, label, settings, children }: Props = $props();

  const route = getBackendRouteContext();
  const kind = $derived(backendNeedsKey(id) ? 'cloud' : id === 'native' ? 'native' : 'local');

  type Status = 'unknown' | 'ready' | 'needs-config' | 'unavailable';
  let beStatus = $state<Status>('unknown');
  let testRunning = $state(false);
  let testSucceeded = $state(false);
  let testResult: string | null = $state(null);
  let testErrCode: string | null = $state(null);
  /** A plain line instead of a result: the settings moved while the test ran, so it proves nothing. */
  let testNote: string | null = $state(null);
  let testLatencyMs: number | null = $state(null);
  // A passed key test outlives a reload; it belongs to the key, model and address it ran with.
  let verifiedAt: number | null = $state(null);
  let nativeOutdated = $state(false);
  const testFailed = $derived(!testRunning && testResult !== null && !testSucceeded);

  // The route is drawn from these answers, so every row reports its own probe.
  $effect(() => {
    const readiness =
      beStatus === 'ready' ? 'ready' : beStatus === 'unknown' ? 'unknown' : 'not-ready';
    route?.report(id, readiness);
  });

  // Closed until the user (or a jump from the welcome banner) opens it; a wall of open cards hides the one that matters.
  let open = $state(false);

  const ollama403 = $derived(
    id === 'ollama' &&
      testResult !== null &&
      (/\b403\b/.test(testResult) || /OLLAMA_ORIGINS/.test(testResult)),
  );
  const ollamaOrigin = `chrome-extension://${chrome.runtime.id}`;
  const slowFirstShotNote = $derived.by<string | null>(() => {
    if (id !== 'ollama' && id !== 'localserver') return null;
    if (testLatencyMs === null || testLatencyMs < 5000) return null;
    if (!testSucceeded) return null;
    return 'Connected. First run after idle is usually the slowest while the model loads.';
  });
  // On the Backends tab the route also knows when the chosen model reads no images.
  const supportsImage = $derived(
    route ? route.readsImages(id) : resolveBackend(id)?.translateImage !== undefined,
  );

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
  // A Test also sends the model, and native runs the chosen CLI; the status probe reads neither.
  const testKey = $derived(
    [
      probeKey,
      lookupModelId(settings.model, id),
      id === 'native' ? (settings.nativeCli ?? '') : '',
    ].join('\x00'),
  );
  // Native pings on a one-shot port: this page's own port-manager copy would keep a host alive until the tab closes.
  function checkAvailable(
    backend: TranslationBackend,
    cfg: BackendConfig,
    fresh = false,
  ): Promise<boolean> {
    if (id !== 'native') return backend.isAvailable(cfg);
    return probeNativeHost(settings.localBackendTimeoutMs, { fresh }).then((r) => {
      nativeOutdated = r.status === 'outdated';
      return r.status === 'installed' || r.status === 'outdated';
    });
  }

  // The card body's Recheck probes too, and after an install its answer is this header's answer.
  $effect(() => {
    if (id !== 'native') return;
    return onNativeProbe((r) => {
      nativeOutdated = r.status === 'outdated';
      beStatus = r.status === 'installed' || r.status === 'outdated' ? 'ready' : 'unavailable';
    });
  });

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
    testResult = null;
    testErrCode = null;
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

  // A stored pass reads back only while the key, model and address are the ones it ran with.
  let lastVerifiedKey: string | null = null;
  $effect(() => {
    const key = testKey;
    if (key === lastVerifiedKey) return;
    lastVerifiedKey = key;
    verifiedAt = null;
    if (kind !== 'cloud') return;
    void readVerified(id, settings).then((at) => {
      if (testKey === key) verifiedAt = at;
    });
  });

  async function recordTest(ok: boolean): Promise<void> {
    if (kind !== 'cloud') return;
    try {
      if (ok) {
        const at = Date.now();
        await markVerified(id, settings, at);
        verifiedAt = at;
      } else {
        await clearVerified(id);
        verifiedAt = null;
      }
    } catch {
      // The mark is a convenience; the test result on screen stands either way.
    }
  }

  async function runTest(): Promise<void> {
    if (backendNeedsKey(id) && !backendHasRequiredKey(id, settings)) {
      testSucceeded = false;
      testErrCode = 'NO_BACKEND';
      testResult = 'Add an API key above, then test again.';
      return;
    }
    testRunning = true;
    testErrCode = null;
    testNote = null;
    // A result belongs to the settings it ran with; one that lands after an edit says nothing about the new value.
    const startKey = testKey;
    const settingsMoved = (): boolean => {
      if (testKey === startKey) return false;
      testSucceeded = false;
      testLatencyMs = null;
      testResult = null;
      testErrCode = null;
      testNote = 'The settings changed while the test ran. Test again.';
      return true;
    };
    try {
      testSucceeded = false;
      testResult = null;
      testLatencyMs = null;
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
      if (settingsMoved()) return;
      // A local server's own request error names the address and the fix, so it runs even when the probe failed.
      if (!available && id !== 'ollama' && id !== 'localserver') {
        beStatus =
          backendNeedsKey(id) && !backendHasRequiredKey(id, settings)
            ? 'needs-config'
            : 'unavailable';
        testLatencyMs = Math.round(performance.now() - probeStart);
        testErrCode = id === 'native' ? 'NATIVE_NOT_INSTALLED' : 'NETWORK';
        testResult =
          id === 'native'
            ? 'Claude Code or Codex did not answer. Follow the install steps above, then click Recheck.'
            : 'Cannot reach this backend. Check the API key, the URL or the local server above.';
        void recordTest(false);
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
        const answer = reply?.ok
          ? readAnswer(answerSpecFor('translate'), reply.result ?? '')
          : undefined;
        const succeeded = reply?.ok === true && answer?.kind === 'ok';
        const result =
          answer?.kind === 'ok'
            ? answer.main.trim().slice(0, 200) || '(empty result)'
            : answer?.kind === 'error'
              ? 'The answer was not in a readable format. Try the test again.'
              : (reply?.error ??
                'No answer from Claude Code or Codex. Click Recheck above, then test again.');
        // The request went out whatever the settings did meanwhile, so the log records it.
        if (succeeded) auditTest(result);
        else auditTest('', { code: reply?.code ?? 'UNKNOWN', message: result });
        if (settingsMoved()) return;
        testLatencyMs = total;
        testResult = result;
        testSucceeded = succeeded;
        testErrCode = succeeded
          ? null
          : answer?.kind === 'error'
            ? answer.code
            : (reply?.code ?? 'UNKNOWN');
        return;
      }
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
              accumulated += c.text;
            } else if (c.type === 'done') done = true;
            else if (c.type === 'error') {
              errCode = c.code;
              errMsg = c.message;
            } else assertNever(c);
          },
        });
      } catch (e) {
        errMsg = (e as Error).message;
      }
      const endAt = performance.now();
      let result: string;
      if (errMsg) {
        result = errMsg;
        auditTest('', { code: errCode ?? 'UNKNOWN', message: errMsg });
      } else if (done) {
        // The model may answer with JSON even though the prompt asks for plain text.
        const scrub = createThinkScrubber();
        const answer = readAnswer(
          answerSpecFor('translate'),
          scrub.push(accumulated) + scrub.flush(),
        );
        if (answer.kind === 'ok') {
          result = answer.main.trim().slice(0, 200) || '(empty result)';
          auditTest(result);
        } else {
          errCode = answer.code === 'EMPTY' ? 'SERVER' : 'PARSE';
          errMsg = result = 'The answer was not in a readable format. Try the test again.';
          auditTest('', { code: errCode, message: result });
        }
      } else {
        result = '(no output)';
        auditTest('', { code: 'UNKNOWN', message: 'no output' });
      }
      // The log above records the request even when the settings moved; only the card's result is dropped.
      if (settingsMoved()) return;
      testLatencyMs = Math.round(endAt - start);
      testResult = result;
      testSucceeded = !errMsg && done;
      testErrCode = testSucceeded ? null : (errCode ?? 'UNKNOWN');
      void recordTest(testSucceeded);
    } finally {
      testRunning = false;
    }
  }
</script>

<div class="backend-card-wrap">
  <CollapsibleCard bind:open title={label} backendId={id} flat>
    {#snippet status()}
      <BackendCardStatus
        {kind}
        {beStatus}
        {supportsImage}
        {verifiedAt}
        {testFailed}
        outdated={nativeOutdated}
        route={route?.label(id) ?? null}
        firstForImages={route?.firstForImages(id) ?? false}
      />
    {/snippet}

    <div class="be-body">
      {#if children}{@render children()}{/if}
    </div>

    <BackendCardTestRow
      {id}
      {testRunning}
      {testSucceeded}
      {testResult}
      {testErrCode}
      {testNote}
      {testLatencyMs}
      {slowFirstShotNote}
      {ollama403}
      {ollamaOrigin}
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
