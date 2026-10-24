<script lang="ts">
  /** Svelte form of stableLabel (stable-label.ts) for the content shadow root: `current` shows, each of `labels` only holds its width (R63). */
  // shadow-css-lint-allow: ega-stable — its rules are STABLE_LABEL_CSS, which shadowHost.ts adds to the root sheet
  let { current, labels }: { current: string; labels: readonly string[] } = $props();
</script>

<span class="ega-stable"
  ><span>{current}</span>{#each labels as label, i (i)}<span aria-hidden="true" data-label={label}
    ></span>{/each}</span
>
