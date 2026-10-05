<script lang="ts">
  import { PRIVATE_FIELD_REASON } from './picker';
  // No props: picker-overlay.ts patches the outline and the hint in place so the hint's live region survives a hover.
</script>

<!-- Position is patched from picker-overlay.ts so the hint's live region survives a hover. -->
<div class="picker-outline" data-ega-picker-outline hidden aria-hidden="true"></div>
<!-- After the outline on purpose: while the outline shows, its own shadow dims the page around the target and this steps aside. -->
<div class="picker-dimmer" aria-hidden="true"></div>
<div class="picker-hint" role="status" aria-live="polite">
  <span class="picker-hint-default">
    <!-- Down goes into a smaller block and Tab to the next one (pick-cursor.ts), not across the page. -->
    Click an area to translate it, or use
    <span class="picker-hint-kbd">↑</span>
    <span class="picker-hint-kbd">↓</span>
    to make it larger or smaller and <span class="picker-hint-kbd">Tab</span> for the next one, then
    <span class="picker-hint-kbd">Enter</span>
    <span class="picker-hint-sep">·</span>
    <span class="picker-hint-kbd">Esc</span> to cancel
  </span>
  <span class="picker-hint-blocked" hidden>{PRIVATE_FIELD_REASON}</span>
</div>
