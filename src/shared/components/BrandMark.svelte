<script lang="ts">
  import iconUrl from '@/assets/icons/icon-32.png';

  interface Props {
    label?: string;
    /** Icon size in px. Stay on 20 (Options header), 16 (popup / side panel) or 14 (mark only). */
    size?: number;
  }

  let { label = 'Ega', size = 16 }: Props = $props();
</script>

<span class="ega-brand-mark" style="--ega-brand-icon-size: {size}px;">
  <img
    class="ega-brand-mark-icon"
    data-ega-brand-icon
    src={iconUrl}
    alt=""
    width={size}
    height={size}
    aria-hidden="true"
    draggable="false"
  />
  <span>{label}</span>
</span>

<style>
  .ega-brand-mark {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    min-width: 0;
    line-height: 1;
  }
  .ega-brand-mark-icon {
    width: var(--ega-brand-icon-size);
    height: var(--ega-brand-icon-size);
    flex: 0 0 var(--ega-brand-icon-size);
    display: block;
  }
</style>
