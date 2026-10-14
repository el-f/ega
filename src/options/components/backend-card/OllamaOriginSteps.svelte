<script lang="ts">
  /** How to let Ega through Ollama's origin check: the exact OLLAMA_ORIGINS value, a Copy button, and the command per system. */
  import Button from '@/shared/ui/Button.svelte';

  interface Props {
    /** chrome-extension://<id>, the value OLLAMA_ORIGINS must hold. */
    origin: string;
  }

  const { origin }: Props = $props();

  let copied = $state(false);
  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(origin);
      copied = true;
      setTimeout(() => (copied = false), 2000);
    } catch {
      copied = false;
    }
  }
</script>

<div class="oo-steps" data-ega-ollama-origin-steps>
  <p class="oo-line">
    Set OLLAMA_ORIGINS to this value where Ollama runs, then restart Ollama. Never use "*": it lets
    any website reach your Ollama.
  </p>
  <div class="oo-origin">
    <code>{origin}</code>
    <Button variant="secondary" size="sm" onclick={() => void copy()}
      >{copied ? 'Copied' : 'Copy'}</Button
    >
  </div>
  <dl class="oo-commands">
    <dt>Windows</dt>
    <dd><code>setx OLLAMA_ORIGINS "{origin}"</code></dd>
    <dt>macOS</dt>
    <dd><code>launchctl setenv OLLAMA_ORIGINS "{origin}"</code></dd>
    <dt>Linux (systemd)</dt>
    <dd>
      <span
        >Run <code>sudo systemctl edit ollama.service</code>, add these two lines, then save:</span
      >
      <code class="oo-block">[Service]<br />Environment="OLLAMA_ORIGINS={origin}"</code>
      <span
        >Then run <code>sudo systemctl daemon-reload && sudo systemctl restart ollama</code></span
      >
    </dd>
  </dl>
</div>

<style>
  .oo-steps {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .oo-line {
    margin: 0;
    max-inline-size: 80ch;
    font-size: var(--fs-base);
    line-height: var(--lh-body);
  }
  .oo-origin {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
  }
  code {
    font-family: var(--font-mono);
    font-size: var(--fs-sm);
    overflow-wrap: anywhere;
  }
  .oo-commands {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: var(--space-1) var(--space-3);
    margin: 0;
    font-size: var(--fs-base);
  }
  .oo-commands dt {
    color: var(--color-muted);
  }
  .oo-commands dd {
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .oo-block {
    display: block;
  }
</style>
