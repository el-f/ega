<script lang="ts">
  /** Shown on the Backends tab while no backend can run, until the user skips it. */
  import SectionCard from '@/shared/ui/SectionCard.svelte';
  import Button from '@/shared/ui/Button.svelte';

  interface Props {
    onUseGemini: () => void;
    onUseOtherKey: () => void;
    onRunLocal: () => void;
    onSkip: () => void;
  }

  const { onUseGemini, onUseOtherKey, onRunLocal, onSkip }: Props = $props();
</script>

<div data-ega-get-started>
  <SectionCard title="Get started" description="Pick one way to run Ega; you can add more later">
    <div class="actions">
      <Button onclick={onUseGemini} dataAttrs={{ 'data-ega-onboard': 'gemini' }}>
        Use a free Gemini key
      </Button>
      <Button
        variant="secondary"
        onclick={onUseOtherKey}
        dataAttrs={{ 'data-ega-onboard': 'other-key' }}
      >
        Use another API key
      </Button>
      <Button variant="secondary" onclick={onRunLocal} dataAttrs={{ 'data-ega-onboard': 'local' }}>
        Run on this computer
      </Button>
      <Button variant="ghost" onclick={onSkip} dataAttrs={{ 'data-ega-onboard': 'dismiss' }}>
        Skip for now
      </Button>
    </div>
  </SectionCard>
</div>

<style>
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
</style>
