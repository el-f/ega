<script lang="ts">
  // No props: picker-overlay.ts patches the outline in place.
</script>

<!-- picker-overlay.ts patches the outline's position in place; the status lives in the picker bar. -->
<div class="picker-outline" data-ega-picker-outline hidden aria-hidden="true"></div>
<!-- After the outline on purpose: while the outline shows, its own shadow dims the page around the target and this steps aside. -->
<div class="picker-dimmer" aria-hidden="true"></div>
