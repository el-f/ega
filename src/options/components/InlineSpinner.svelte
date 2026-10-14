<script lang="ts">
  /** A small spinner before a button's label while its action runs ("Testing...", "Discovering..."). */
</script>

<span class="inline-spinner" aria-hidden="true" data-ega-inline-spinner></span>

<style>
  .inline-spinner {
    display: inline-block;
    width: 12px;
    height: 12px;
    margin-inline-end: var(--space-2);
    border: 2px solid currentColor;
    border-top-color: transparent;
    border-radius: 50%;
    vertical-align: -2px;
    animation: inline-spin 600ms linear infinite;
  }
  @keyframes inline-spin {
    to {
      transform: rotate(360deg);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .inline-spinner {
      animation: none;
    }
  }
</style>
