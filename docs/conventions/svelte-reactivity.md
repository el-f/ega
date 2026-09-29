<!-- cspell:ignore onconsider onfinalize -->

# Svelte 5 reactivity discipline

Runes (`$state`, `$derived`, `$effect`, `$props`, `$bindable`) make most of this codebase fine-grained reactive. They do not prevent five bug classes that have shipped here. Each one below has a symptom, a fix, and — for three of them — a lint rule.

The lint script is `scripts/reactivity-lint.ts`. It runs as `pnpm lint:reactivity`, in the `lefthook.yml` pre-commit hook and in `pnpm verify`. The shadow-state helper is `src/shared/svelte/useShadowSync.svelte.ts#useShadowSync`. Read the source of either when in doubt.

---

## The drag zone this repo uses

Three drag zones ship, in two components. All use `dragHandleZone` plus a `use:dragHandle` grip. None use whole-card `dndzone`.

| Component                                          | Zones                               | Grip                                               |
| -------------------------------------------------- | ----------------------------------- | -------------------------------------------------- |
| `src/options/components/BackendList.svelte`        | active backends, available backends | `.be-gutter` in `src/options/tabs/Backends.svelte` |
| `src/options/components/ContextMenuManager.svelte` | right-click menu rows               | `.cm-handle` in the same file                      |

`dragHandleZone` starts a pointer drag only when the press lands on an element marked `use:dragHandle`. A press anywhere else on the row starts nothing, so the buttons, checkboxes and text inputs inside a row keep working.

A drag still re-renders the whole zone, so keep anything with its own pointer gesture outside it. `src/options/components/LocalBackendTuningSection.svelte` sits outside `BackendList.svelte` for that reason: a drag re-render unmounts its slider mid-drag.

The option bag both components pass:

```svelte
use:dragHandleZone={{ items: shadow.items, dragDisabled: false, flipDurationMs: 180 }}
```

- `items` — the array the library reads and replaces. It must be writable `$state` (Trap 1).
- `dragDisabled: false` — the user-level switch, and already the default. The handle still gates every pointer drag.
- `flipDurationMs` — the move animation. 180 in `BackendList.svelte`, 160 in `ContextMenuManager.svelte`.

---

## Trap 1 — a `use:` directive fed a `$derived` array

### Symptom

The list renders. A drag starts, then rows disappear, or they stay put and never show the dragged-over position. The drop commits nothing. Keyboard reorder still works.

### Why it happens

`svelte-dnd-action` replaces the items array on every position update and hands the new order back through `consider` and `finalize`. A `$derived` value cannot hold that write. `const rows = $derived(...)` fails to compile on assignment (`constant_assignment`); `let rows = $derived(...)` takes the write, but the next change to a dependency recomputes it away. Either way the library's internal order and the rendered DOM drift apart. The same holds for any library that owns its items array.

### Fix

Mirror the source data into `$state`, and write back from both events.

```svelte
<script lang="ts">
  import { dragHandleZone, dragHandle } from 'svelte-dnd-action';
  import { isShadowRow } from '@/shared/dnd-shadow-row';
  import { useShadowSync } from '@/shared/svelte/useShadowSync.svelte';

  let { settings }: Props = $props();
  type Row = { id: string };

  const shadow = useShadowSync<Row>({
    seed: () => settings.backendOrder.map((id) => ({ id })),
    keyOf: (xs) => xs.map((r) => r.id).join('|'),
  });
</script>

<div
  use:dragHandleZone={{ items: shadow.items, dragDisabled: false, flipDurationMs: 180 }}
  onconsider={(e) => (shadow.items = e.detail.items)}
  onfinalize={(e) => {
    const rows = e.detail.items.filter((r) => !isShadowRow(r));
    shadow.items = rows;
    commit(rows);
  }}
>
  {#each shadow.items as row (row.id)}
    {#if isShadowRow(row)}
      <div class="drop-slot" aria-hidden="true">Drop here</div>
    {:else}
      <div class="row">
        <span class="handle" use:dragHandle>⋮⋮</span>
        {row.id}
      </div>
    {/if}
  {/each}
</div>
```

The helper takes a seed function and a key function. It seeds the state, re-seeds only when the key changes, and its setter stores the new key in the same step — so assigning `shadow.items` from your own handler never triggers a re-seed. It knows nothing about `consider` and `finalize`; you wire those yourself.

Pick `keyOf` to cover every field the rows render. An id-only key is right when only order and membership show, which is why `BackendList.svelte` joins the ids. A whole-row key is needed when a rename, a toggle or a reset must reach the list, which is why `ContextMenuManager.svelte` uses `JSON.stringify`.

---

## Trap 2 — an `$effect` that reads and writes the same state

### Symptom

You set a `$state` in an event handler. The next render reverts it. Later handlers fire and the state never sticks. A drag preview snaps back; a tab selection bounces.

### Why it happens

`$effect(...)` tracks every reactive read in its body. Reading `enabledRows` there makes `enabledRows` a dependency. When a handler writes `enabledRows = newOrder`, the effect schedules, re-runs, reads the unchanged source of truth, and writes `enabledRows = original`. Every write appears to do nothing.

### Fix

Gate the effect on a memo key over the source of truth. Skip the body when the key matches the last sync. Local writes do not change the key, so the effect leaves them alone.

```ts
let lastOrderKey = '';
$effect(() => {
  const orderKey = settings.backendOrder.join('|');
  if (orderKey === lastOrderKey) return;
  lastOrderKey = orderKey;
  enabledRows = computeFrom(settings);
});
```

`useShadowSync` does this for you: `keyOf` is the memo key, and the setter updates the stored key in the same step.

Alternatives:

- `untrack(() => fn())` opts one read out of dependency tracking. Used for a one-off read in `src/options/components/NativeBackendCard.svelte`. The memo key is the better default.
- Drop the effect. If the seed can happen at the `$state` initial value and nothing external needs to sync in, no effect is the cleanest fix.

---

## Trap 3 — a zone with no `onconsider` or `onfinalize`

### Symptom

The drag starts but nothing moves under the cursor. Or items vanish on drop and never come back.

### Why it happens

`svelte-dnd-action` sends `consider` on every position update during a drag and `finalize` on drop. The host has to mirror `detail.items` back from both, or the rendered DOM stops matching the library's own state. No `consider` means the drag is silent. No `finalize` means the drop never commits.

### Fix

Wire both, in the same opening tag as the directive. In Svelte 5 prefer `onconsider` / `onfinalize` over the legacy `on:consider` / `on:finalize`; both work, and mixing them in one file is confusing.

---

## Trap 4 — the placeholder row reaches your commit

### Symptom

A row with the id `id:dnd-shadow-placeholder-0000` lands in stored settings. The drag clone is left behind on the page after the drop.

### Why it happens

While a drag hovers a zone, the library injects a placeholder item into `detail.items`. It carries `isDndShadowItem: true` and the id above. It has to render — that is the gap the dragged card will drop into — but treating it as real data writes it to storage and orphans the drag clone.

### Fix

Render an inert branch for it, and filter it out before every write. `src/shared/dnd-shadow-row.ts#isShadowRow` matches both markers. Both real zones do both: `BackendList.svelte` filters in each finalize handler, and `ContextMenuManager.svelte` filters before `patchItems`.

---

## Trap 5 — two zones, one write

### Symptom

A drag from one list into another writes settings twice. The first write holds a half-updated order, and whatever reads settings in between sees it.

### Why it happens

A cross-zone drag fires `finalize` on the source zone and on the target zone. A handler that commits on each event commits twice. Waiting for both events is not the fix either: a drag inside one zone fires `finalize` only there, so a handler that waits for its partner never commits at all.

### Fix

Stage each half, seed the missing half from the current shadow state, then commit once. `src/options/components/BackendList.svelte#commitPending` is the worked example: each finalize handler stores its own filtered rows, fills in the other half from that zone's shadow if no event has landed for it, and calls `commitPending`. `commitPending` writes only when both halves are present and their combined id set matches `settings.backendOrder` exactly — a missing id or a duplicate means the event is stale, so it drops it.

---

## Testing a `use:` integration

**Unit test, for the handler wiring.** Dispatch real `consider` and `finalize` `CustomEvent`s at the zone element. `dragHandleZone` reads `e.detail.info.source` and `e.detail.info.trigger` in its own listeners, so a dispatch without an `info` object throws a `TypeError`. Build the detail with the helper the committed test uses, `tests/unit/shared/BackendList.svelte.test.ts#dndDetail`:

```ts
function dndDetail(items: { id: string; isDndShadowItem?: boolean }[]) {
  return {
    items,
    info: { source: 'POINTER', trigger: 'DRAG_STARTED', id: items[0]?.id ?? '' },
  };
}

const zone = container.querySelectorAll('[role="list"]')[0] as HTMLElement;
zone.dispatchEvent(
  new CustomEvent('consider', {
    detail: dndDetail([{ id: 'gemini' }, { id: 'anthropic' }, { id: 'openai' }]),
  }),
);
await waitFor(() => {
  const ids = Array.from(zone.querySelectorAll('[data-testid^="be-row-"]')).map((el) =>
    el.getAttribute('data-testid'),
  );
  expect(ids).toEqual(['be-row-gemini', 'be-row-anthropic', 'be-row-openai']);
});
```

The library registers its zones on its own timer, so poll with `waitFor` instead of guessing a delay. Keep a fixed wait only for a negative assertion: proving that nothing committed needs a sample taken past the point a real commit would have landed.

**End-to-end, for the library's own cleanup.** A drag only starts from the grip, so `dragTo` or a `mouse.down` on the middle of a row does nothing — and a spec written that way still passes, because the seeded order is the order it asserts. `tests/e2e/backend-order-drag.spec.ts` presses the middle of a card, so it does not exercise a drag. Press `.be-gutter`, move in several small steps, and assert an order that differs from the seed; then the run is worth its browser launch, and it covers what the unit test cannot — the drag clone (`#dnd-action-dragged-el`) being removed, and no `pageerror` from the drop handler.

---

## Lint rules

`scripts/reactivity-lint.ts` scans every `.svelte` file under `src/`. Four rule ids, each reported as the file, the line, the rule and a message.

| Rule                       | Matches                                                                                                                                                 | Does not match                                                                                             | Suppression                                                                                                                                                                  |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `use-on-derived`           | a `use:X` directive whose inline `{{ … }}` bag has an `items:` key naming an identifier declared `$derived(...)` or `$derived.by(...)` in the same file | a bag passed as a variable rather than written inline; a derived value reached through a prop or an import | none                                                                                                                                                                         |
| `effect-reads-and-writes`  | an `$effect` or `$effect.pre` whose braced arrow body both reads and writes one top-level `$state`, `$derived` or `$bindable` name                      | the expression form and the `function () {}` form of `$effect`; locals declared inside the body            | a call to `untrack(` in the body, or a comparison written `key === lastSomethingKey` — the guard name has to sit on the right of `===`, start with `last` and end with `Key` |
| `dndzone-missing-consider` | an opening tag with `use:dndzone` or `use:dragHandleZone` and no `onconsider` or `on:consider`                                                          | a handler attached from script with `addEventListener`                                                     | none                                                                                                                                                                         |
| `dndzone-missing-finalize` | the same tags, with no `onfinalize` or `on:finalize`                                                                                                    | the same                                                                                                   | none                                                                                                                                                                         |

The tag scan ends at the `>` that closes the opening tag, counting braces and quotes, so an inline arrow handler after the directive is still seen.

---

## Checklist for a new `use:` integration

1. **State source.** Writable `$state`, never `$derived`. Use `useShadowSync` when the source data comes from props.
2. **Both events.** `onconsider` and `onfinalize`, both writing the same shadow.
3. **Key.** `keyOf` covers every field the rows render — ids alone when only order and membership show, the whole row when an edit must reach the list.
4. **Placeholder.** Render `isShadowRow(row)` as an inert slot, and filter it out before any write.
5. **One write per drag.** If a row can move between two zones, stage both halves and commit once.
6. **Unit test.** Dispatch real `consider` / `finalize` events with an `info` object, and assert with `waitFor`.
7. **Lint.** `pnpm lint:reactivity` runs pre-commit and in `pnpm verify`. If it fires, the message names the trap.
