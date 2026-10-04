<script lang="ts">
  import Button from '@/shared/ui/Button.svelte';

  interface Props {
    onChooseGemini: () => void;
    onDismiss: () => void;
  }

  let { onChooseGemini, onDismiss }: Props = $props();
</script>

<aside class="onboarding" role="region" aria-label="Get started with Ega">
  <p class="lead">Pick a backend. You can change this later.</p>
  <div class="onboarding-actions">
    <Button onclick={onChooseGemini} dataAttrs={{ 'data-ega-onboard': 'gemini' }}>
      Add a Gemini key
    </Button>
    <Button variant="ghost" onclick={onDismiss} dataAttrs={{ 'data-ega-onboard': 'dismiss' }}>
      Skip for now
    </Button>
  </div>
  <p class="sub">Takes about a minute at Google AI Studio. Free tier. Read Google's terms first.</p>
</aside>

<style>
  .onboarding {
    margin-bottom: var(--space-3);
    padding: var(--space-3) var(--space-4);
    border: 1px solid var(--color-accent);
    border-radius: var(--radius-lg);
    background: var(--color-accent-bg-soft);
    color: var(--color-fg);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .lead {
    margin: 0;
    font-size: var(--fs-md);
  }
  .onboarding-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
  .sub {
    margin: 0;
    color: var(--color-muted);
    font-size: var(--fs-xs);
  }
</style>
