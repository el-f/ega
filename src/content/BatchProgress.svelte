<script lang="ts">
  interface Props {
    done: number;
    total: number;
    liveMessage: string;
    onCancel: () => void;
    onUndo?: () => void;
    onRetryFailed?: () => void;
    onClose?: () => void;
  }
  let { done, total, liveMessage, onCancel, onUndo, onRetryFailed, onClose }: Props = $props();

  function normaliseTotal(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, value);
  }

  function normaliseDone(value: number, maximum: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.min(Math.max(0, value), maximum);
  }

  let progressTotal = $derived(normaliseTotal(total));
  let progressDone = $derived(normaliseDone(done, progressTotal));
  let progressPercent = $derived(progressTotal > 0 ? (progressDone / progressTotal) * 100 : 0);
</script>

<div class="ega-batch-progress" aria-label="Translating page" data-ega-batch-progress>
  <!-- The visible count changes on every block, so it stays out of the live region and the sr-only span announces. -->
  <div class="meta">
    <span class="label" data-ega-batch-label
      >Translating {done} of {total} {total === 1 ? 'area' : 'areas'}…</span
    >
    <span class="ega-sr-only" role="status" aria-live="polite" data-ega-batch-live
      >{liveMessage}</span
    >
  </div>
  <!-- batch-progress.ts sets --ega-batch-progress on the wrap, so the bar reflows without a remount. -->
  <div
    class="bar"
    role="progressbar"
    aria-label="Translation progress"
    aria-valuemin="0"
    aria-valuemax={progressTotal}
    aria-valuenow={progressDone}
    data-ega-batch-bar
  >
    <div class="bar-fill" data-ega-batch-bar-fill style:width="{progressPercent}%"></div>
  </div>
  <div class="actions">
    <button
      type="button"
      class="cancel"
      aria-label="Stop translating and keep the finished areas"
      onclick={onCancel}
      data-ega-batch-cancel
    >
      Stop
    </button>
    <!-- The buttons below are always mounted and only hidden: a late one would shift the row. -->
    <button type="button" class="retry-failed" hidden onclick={onRetryFailed}>Retry failed</button>
    <button type="button" class="undo" aria-label="Undo the page translation" onclick={onUndo}>
      Undo all
    </button>
    <button
      type="button"
      class="close"
      aria-label="Hide this bar (translation kept)"
      onclick={onClose}
      data-ega-batch-close
      data-ready="false">Hide</button
    >
  </div>
</div>
