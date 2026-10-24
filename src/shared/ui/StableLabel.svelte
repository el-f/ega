<script lang="ts">
  /** A plain button's label that keeps the widest of `labels` (R63): `current` shows, each of `labels` only holds its width. The rules are .ega-stable in tokens.css, so they reach the shadow root too. */
  interface Props {
    current: string;
    labels: readonly string[];
    /** Words at the start instead of centred: for a text link, whose line begins where its words do. */
    start?: boolean;
  }

  let { current, labels, start = false }: Props = $props();
</script>

<span class="ega-stable" class:is-start={start}
  ><span>{current}</span>{#each labels as label, i (i)}<span aria-hidden="true" data-label={label}
    ></span>{/each}</span
>
