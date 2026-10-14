import { SHADOW_PLACEHOLDER_ITEM_ID } from 'svelte-dnd-action';

/** The mid-drag placeholder must render, but looking its id up as real data orphans the drag clone. */
export function isShadowRow(row: { id: string }): boolean {
  return (
    (row as { isDndShadowItem?: boolean }).isDndShadowItem === true ||
    row.id === SHADOW_PLACEHOLDER_ITEM_ID
  );
}
