<script lang="ts">
  import { ICON_REGISTRY, type ActionKind } from './action-icons';

  interface Props {
    kind: ActionKind;
    size?: number;
    strokeWidth?: number;
  }

  const { kind, size = 16, strokeWidth = 1.75 }: Props = $props();

  const Glyph = $derived(ICON_REGISTRY[kind]);
</script>

<span class="ega-icon" aria-hidden="true" data-action-icon={kind}>
  <Glyph {size} {strokeWidth} />
</span>

<style>
  .ega-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    line-height: 0;
    color: currentColor;
  }
</style>
