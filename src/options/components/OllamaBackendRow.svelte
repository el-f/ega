<script lang="ts">
  import { debugCatch } from '@/shared/logger';
  import { DEFAULT_LOCAL_BACKEND_TIMEOUT_MS, DEFAULT_OLLAMA_URL } from '@/shared/constants';
  import { isLoopbackUrl } from '@/shared/loopback-url';
  import { resolveModelId } from '@/shared/settings-schema';
  import type { Settings, BackendId } from '@/shared/types';
  import BackendCard from './BackendCard.svelte';
  import Select from '@/shared/ui/Select.svelte';
  import Input from '@/shared/ui/Input.svelte';
  import {
    isOllamaCloudName,
    ollamaModelLabel,
    parseOllamaTags,
    type OllamaTagRow,
  } from '@/shared/backends/ollama-show';

  interface Props {
    id: BackendId;
    label: string;
    settings: Settings;
    routeIsText: boolean;
    routeIsImage: boolean;
    onPatch: (next: Partial<Settings>) => void;
    onModelChange: (next: string) => void;
  }

  let { id, label, settings, routeIsText, routeIsImage, onPatch, onModelChange }: Props = $props();

  const extId = chrome.runtime.id;
  const ollamaOrigin = `chrome-extension://${extId}`;

  let ollamaDiscovering = $state(false);
  let ollamaDiscovered: OllamaTagRow[] | null = $state(null);
  let ollamaError: string | null = $state(null);
  let originCopied = $state(false);
  // Holds a half-typed URL under the caret; the sanitized snapshot would otherwise repaint the default.
  let urlDraft = $state<string | null>(null);

  async function discoverOllamaModels(url: string): Promise<void> {
    const base = (url || DEFAULT_OLLAMA_URL).trim().replace(/\/+$/, '');
    const timeoutMs = Math.max(
      settings.localBackendTimeoutMs ?? DEFAULT_LOCAL_BACKEND_TIMEOUT_MS,
      5000,
    );
    ollamaDiscovering = true;
    ollamaError = null;
    try {
      const res = await fetch(`${base}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) {
        ollamaError = `Ollama responded ${res.status}${res.statusText ? ` ${res.statusText}` : ''}. Make sure it is running (\`ollama serve\`) and the URL is correct.`;
        return;
      }
      ollamaDiscovered = parseOllamaTags(await res.json());

      // /api/tags is lenient on CORS and /api/chat is strict, so tags-ok plus chat-403 means the origin is not allow-listed.
      try {
        const preflight = await fetch(`${base}/api/chat`, {
          method: 'OPTIONS',
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (preflight.status === 403) {
          ollamaError =
            'Ollama is running but blocking this extension. ' +
            `Set OLLAMA_ORIGINS="chrome-extension://${extId}" in the environment where \`ollama serve\` runs, then restart Ollama. ` +
            'Do not use wildcards — they let any site or any installed extension reach your Ollama. ' +
            'The "Expose to network" toggle in the Ollama app changes the bind address only; it does not let extensions through.';
        }
      } catch (e) {
        debugCatch(e, 'options.components.OllamaBackendRow.1');
      }
    } catch (e) {
      const msg = (e as Error).message ?? 'unknown error';
      const timedOut =
        (e instanceof DOMException && e.name === 'TimeoutError') || /timed out|timeout/i.test(msg);
      ollamaError = timedOut
        ? `Ollama did not answer at ${base} within ${timeoutMs}ms. Start it with \`ollama serve\` and try again.`
        : `Cannot reach Ollama at ${base}. Is it running? (\`ollama serve\` — ${msg})`;
    } finally {
      ollamaDiscovering = false;
    }
  }

  async function copyOrigin(): Promise<void> {
    try {
      await navigator.clipboard.writeText(ollamaOrigin);
      originCopied = true;
      setTimeout(() => {
        originCopied = false;
      }, 1400);
    } catch (e) {
      debugCatch(e, 'options.components.OllamaBackendRow.2');
    }
  }
</script>

<BackendCard {id} {label} {settings} {routeIsText} {routeIsImage}>
  <div class="ollama-panel">
    <section class="ollama-step">
      <div class="ollama-step-head">
        <span class="ollama-step-num">1</span>
        <div>
          <b>Connection</b>
          <small>Where Ega should reach your local daemon.</small>
        </div>
      </div>
      <label for="be-url-ol">Ollama URL</label>
      <input
        id="be-url-ol"
        data-ega-setting="backends.ollamaUrl"
        type="text"
        dir="auto"
        placeholder={DEFAULT_OLLAMA_URL}
        value={urlDraft ?? settings.ollamaUrl ?? DEFAULT_OLLAMA_URL}
        oninput={(e) => {
          const v = (e.currentTarget as HTMLInputElement).value;
          // A prefix of a loopback URL fails the schema; the draft holds it under the caret until it parses or the field is left.
          urlDraft = v;
          if (v === '' || isLoopbackUrl(v)) onPatch(v ? { ollamaUrl: v } : { ollamaUrl: '' });
        }}
        onchange={(e) => {
          const v = (e.currentTarget as HTMLInputElement).value;
          urlDraft = null;
          onPatch(v ? { ollamaUrl: v } : { ollamaUrl: '' });
        }}
        onblur={() => (urlDraft = null)}
      />
      <div class="help">
        Discover lists your installed models (<code>/api/tags</code>). <b>Test now</b> sends a real
        request (<code>/api/chat</code>), so it also checks extension access.
      </div>
    </section>

    <section class="ollama-step">
      <div class="ollama-step-head">
        <span class="ollama-step-num">2</span>
        <div>
          <b>Model</b>
          <small>Pick an installed model, or type one manually.</small>
        </div>
      </div>
      <span class="ollama-model-label">Model</span>
      <div class="row ollama-model-row">
        {#if ollamaDiscovered && ollamaDiscovered.length > 0}
          {@const opts = [
            ...ollamaDiscovered.map((r) => ({ value: r.name, label: ollamaModelLabel(r) })),
            ...(ollamaDiscovered.some((r) => r.name === settings.model.ollama)
              ? []
              : [
                  {
                    value: settings.model.ollama,
                    label: isOllamaCloudName(settings.model.ollama)
                      ? `${settings.model.ollama} (cloud)`
                      : `${settings.model.ollama} (not pulled locally)`,
                  },
                ]),
          ]}
          <Select
            size="sm"
            ariaLabel="Ollama model"
            value={settings.model.ollama}
            options={opts}
            onchange={(v) => onModelChange(v)}
          />
        {:else}
          <Input
            ariaLabel="Ollama model"
            value={settings.model.ollama}
            oninput={(e) => onModelChange((e.currentTarget as HTMLInputElement).value)}
          />
        {/if}
        <button
          type="button"
          onclick={() => void discoverOllamaModels(settings.ollamaUrl ?? DEFAULT_OLLAMA_URL)}
          disabled={ollamaDiscovering}
        >
          {ollamaDiscovering ? 'Discovering…' : 'Discover models'}
        </button>
      </div>
      {#if isOllamaCloudName(settings.model.ollama) || ollamaDiscovered?.some((r) => r.cloud && r.name === settings.model.ollama)}
        <div class="help">
          This is an Ollama cloud model: it runs on ollama.com, so your text leaves this machine.
          Set
          <code>OLLAMA_NO_CLOUD=1</code> to turn cloud models off.
        </div>
      {/if}
      {#if ollamaError}
        <div class="help help-danger">
          {ollamaError}
        </div>
      {:else if ollamaDiscovered && ollamaDiscovered.length === 0}
        <div class="help">
          Connected, but no models are pulled yet. Run
          <code>ollama pull {resolveModelId(settings.model, 'ollama')}</code>, then discover again.
        </div>
      {:else if ollamaDiscovered && ollamaDiscovered.length > 0}
        {@const cloud = ollamaDiscovered.filter((r) => r.cloud).length}
        {@const local = ollamaDiscovered.length - cloud}
        <div class="help">
          Found {local} local model{local === 1 ? '' : 's'}{cloud > 0
            ? ` and ${cloud} cloud model${cloud === 1 ? '' : 's'}`
            : ''}.
        </div>
      {:else}
        <div class="help">
          Install from
          <a href="https://ollama.com/download" target="_blank" rel="noopener noreferrer"
            >ollama.com</a
          >, run <code>ollama serve</code>, then pull a model.
        </div>
      {/if}
    </section>

    <details class="ollama-access">
      <summary>
        <span>
          <b>Extension access</b>
          <small>Open this if Test now fails with a 403, CORS or OLLAMA_ORIGINS error.</small>
        </span>
      </summary>
      <div class="ollama-origin-card">
        <div>
          <b>Ega origin</b>
          <span>Use this exact value; do not use wildcards.</span>
        </div>
        <div class="row ollama-origin-row">
          <input
            type="text"
            dir="auto"
            readonly
            value={ollamaOrigin}
            class="ollama-origin-input"
            aria-label="Ega extension origin"
          />
          <button type="button" onclick={() => void copyOrigin()}>
            {originCopied ? 'Copied' : 'Copy origin'}
          </button>
        </div>
      </div>
      <div class="ollama-command-grid">
        <div>
          <b>Windows</b>
          <code>setx OLLAMA_ORIGINS "{ollamaOrigin}"</code>
        </div>
        <div>
          <b>macOS</b>
          <code>launchctl setenv OLLAMA_ORIGINS "{ollamaOrigin}"</code>
        </div>
        <div>
          <b>Linux (systemd)</b>
          <code>sudo systemctl edit ollama.service</code>
          <span>Add these two lines, then save:</span>
          <code>[Service]</code>
          <code>Environment="OLLAMA_ORIGINS={ollamaOrigin}"</code>
          <code>sudo systemctl daemon-reload && sudo systemctl restart ollama</code>
        </div>
      </div>
      <div class="help">
        Restart Ollama after changing the environment. The Ollama app's "Expose to network" toggle
        only changes the bind address; it does not allow-list extensions.
      </div>
    </details>
  </div>
</BackendCard>

<style>
  /* The label look without a for: the picker names itself with aria-label. */
  .ollama-model-label {
    display: block;
    margin: var(--space-2) 0 var(--space-1);
    font-size: var(--fs-sm);
    opacity: 0.8;
  }
  .ollama-panel {
    display: grid;
    gap: var(--space-3);
  }
  .ollama-step,
  .ollama-access {
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-md);
    background: var(--color-bg-elevated);
    padding: var(--space-3);
  }
  .ollama-step-head {
    display: flex;
    align-items: flex-start;
    gap: var(--space-2);
    margin-bottom: var(--space-1);
  }
  .ollama-step-head b,
  .ollama-access summary b {
    display: block;
    font-size: var(--fs-sm);
    color: var(--color-fg);
  }
  .ollama-step-head small,
  .ollama-access summary small {
    display: block;
    font-size: var(--fs-xs);
    color: var(--color-muted);
  }
  .ollama-step-num {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    border-radius: var(--radius-pill);
    background: var(--color-accent-bg-soft);
    color: var(--color-accent-soft);
    font-size: var(--fs-xs);
    font-weight: 700;
    flex: 0 0 22px;
  }
  .ollama-access > summary {
    cursor: pointer;
    list-style: none;
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
  /* A CSS chevron instead of the platform triangle, which does not match the rest of the options surface. */
  .ollama-access > summary::-webkit-details-marker {
    display: none;
  }
  .ollama-access > summary::before {
    content: '';
    flex: 0 0 auto;
    width: 6px;
    height: 6px;
    border-right: 1.5px solid var(--color-muted);
    border-bottom: 1.5px solid var(--color-muted);
    transform: rotate(-45deg);
    transition: transform var(--motion-fast) var(--ease-out);
  }
  .ollama-access[open] > summary::before {
    transform: rotate(45deg);
  }
  .ollama-origin-card {
    margin-top: var(--space-2);
    padding: var(--space-2);
    border-radius: var(--radius-md);
    background: var(--color-bg-sunken);
    color: var(--color-muted);
    font-size: var(--fs-sm);
  }
  .ollama-origin-card b {
    color: var(--color-fg);
  }
  .ollama-origin-card span {
    display: block;
  }
  .ollama-origin-row {
    margin-top: var(--space-1);
    gap: var(--space-1);
  }
  .ollama-origin-input {
    flex: 1;
    font-family: var(--font-mono);
  }
  /* Widths are floored for the longer label so the "Copied" / "Discovering…"
     swap happens in place instead of resizing the button under the pointer. */
  .ollama-origin-row > button {
    min-width: 6.5rem;
  }
  .ollama-model-row > button {
    min-width: 8rem;
  }
  .ollama-model-row {
    gap: var(--space-1);
    align-items: stretch;
  }
  .ollama-model-row :global(select),
  .ollama-model-row :global(input[type='text']) {
    flex: 1;
  }
  .ollama-command-grid {
    display: grid;
    gap: var(--space-2);
    margin-top: var(--space-2);
  }
  .ollama-command-grid > div {
    display: grid;
    gap: 2px;
    padding: var(--space-2);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-md);
    background: var(--color-bg);
  }
  .ollama-command-grid b {
    font-size: var(--fs-xs);
    color: var(--color-muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .ollama-command-grid code {
    overflow-wrap: anywhere;
  }
  .help-danger {
    color: var(--color-danger);
  }
</style>
