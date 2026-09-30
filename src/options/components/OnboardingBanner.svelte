<script lang="ts">
  interface Props {
    onChooseGemini: () => void;
    onDismiss: () => void;
  }

  let { onChooseGemini, onDismiss }: Props = $props();
</script>

<aside class="onboarding" role="region" aria-label="Get started with Ega">
  <div class="onboarding-body">
    <p>Pick a backend. You can change this later.</p>
    <div class="onboarding-actions">
      <button type="button" class="primary" onclick={onChooseGemini} data-ega-onboard="gemini">
        Add a free Gemini key
        <span class="sub">~60s signup at Google AI Studio · works in any browser</span>
      </button>
      <button type="button" class="ghost" onclick={onDismiss} data-ega-onboard="dismiss">
        Advanced / skip
      </button>
    </div>
  </div>
</aside>

<style>
  .onboarding {
    margin-bottom: var(--space-3);
    padding: var(--space-3) var(--space-4);
    border: 1px solid var(--color-warning-border);
    border-radius: var(--radius-lg);
    background: var(--color-warning-bg-deep);
    color: var(--color-warning-fg);
  }
  .onboarding-body p {
    margin: 0 0 var(--space-2) 0;
    color: inherit;
    font-size: var(--fs-md);
  }
  .onboarding-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
  .onboarding-actions button {
    display: inline-flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border);
    background: var(--color-bg);
    color: var(--color-fg);
    cursor: pointer;
    font-size: var(--fs-sm);
    line-height: 1.3;
  }
  .onboarding-actions .primary {
    border-color: var(--color-accent, var(--color-fg));
    background: var(--color-accent, var(--color-bg-hover));
    color: var(--color-accent-fg);
  }
  .onboarding-actions .ghost {
    background: transparent;
    color: var(--color-warning-fg);
  }
  .onboarding-actions .sub {
    color: var(--color-muted);
    font-size: var(--fs-xs);
  }
  .onboarding-actions .primary .sub {
    /* Tinting this down drops below WCAG AA on the accent background. */
    color: inherit;
  }
  .onboarding-actions button:hover {
    background: var(--color-bg-hover);
  }
  .onboarding-actions .primary:hover {
    filter: brightness(1.05);
  }
</style>
