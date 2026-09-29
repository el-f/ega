<script lang="ts">
  // No props: picker-overlay.ts patches the outline in place so the hint's live region survives a hover.
</script>

<div class="picker-dimmer" aria-hidden="true"></div>
<!-- Position is patched from picker-overlay.ts so the hint's live region survives a hover. -->
<div class="picker-outline" data-ega-picker-outline hidden aria-hidden="true"></div>
<div class="picker-hint" role="status" aria-live="polite">
  Click or use arrow keys + <span class="picker-hint-kbd">Enter</span> to translate
  <span class="picker-hint-sep">·</span>
  <span class="picker-hint-kbd">Esc</span> to cancel
</div>
