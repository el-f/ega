/** Geometry probe: no button in a surface may move or resize when a control changes state (R63). */

import { expect, type Locator } from '@playwright/test';

export interface Box {
  readonly name: string;
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

const CONTROLS = 'button, [role="button"], [role="tab"], [role="radio"], [role="switch"]';
const MARK = 'data-ega-geometry-probe';

/**
 * Offset boxes, not getBoundingClientRect: Playwright scrolls an element into view before it
 * clicks, so viewport coordinates move with the scroll even when nothing shifted. Positions are
 * relative to the surface, so a sticky surface that moved with the scroll counts as no shift.
 */
async function snapshot(surface: Locator, tag: boolean): Promise<Record<string, Box>> {
  return surface.evaluate(
    (root, { selector, mark, tag }) => {
      const out: Record<string, Box> = {};
      const origin = (start: HTMLElement): { left: number; top: number } => {
        let left = 0;
        let top = 0;
        for (let n: HTMLElement | null = start; n; n = n.offsetParent as HTMLElement | null) {
          left += n.offsetLeft;
          top += n.offsetTop;
        }
        return { left, top };
      };
      const base = origin(root as HTMLElement);
      const nodes = tag
        ? Array.from(root.querySelectorAll<HTMLElement>(selector))
        : Array.from(root.querySelectorAll<HTMLElement>(`[${mark}]`));
      nodes.forEach((el, i) => {
        if (tag) {
          // Skip what is not rendered: display:none has no offsetParent.
          if (el.offsetParent === null) return;
          el.setAttribute(mark, String(i));
        }
        const id = el.getAttribute(mark) ?? String(i);
        const name =
          [
            el.getAttribute('aria-label'),
            el.getAttribute('data-testid'),
            el.textContent.trim().slice(0, 40),
            el.id,
          ].find((v) => v) ?? '';
        const at = origin(el);
        out[id] = {
          name,
          left: at.left - base.left,
          top: at.top - base.top,
          width: el.offsetWidth,
          height: el.offsetHeight,
        };
      });
      return out;
    },
    { selector: CONTROLS, mark: MARK, tag },
  );
}

/** Lists every button that moved or resized by more than `tolerancePx`, or left the DOM. */
export function diffBoxes(
  before: Record<string, Box>,
  after: Record<string, Box>,
  tolerancePx = 1,
): string[] {
  const moved: string[] = [];
  for (const [id, b] of Object.entries(before)) {
    const a = after[id];
    if (!a) {
      moved.push(`"${b.name}" was removed or replaced; keep one element and change its text`);
      continue;
    }
    const deltas = (['left', 'top', 'width', 'height'] as const)
      .filter((k) => Math.abs(a[k] - b[k]) > tolerancePx)
      .map((k) => `${k} ${b[k]} -> ${a[k]}`);
    if (deltas.length > 0) moved.push(`"${b.name}": ${deltas.join(', ')}`);
  }
  return moved;
}

/**
 * Records every button in `surface`, runs `change` (the click plus the wait for the new state),
 * and fails when any of them moved or resized by more than 1 px.
 */
export async function expectNoLayoutShift(
  surface: Locator,
  change: () => Promise<void>,
  label: string,
): Promise<void> {
  const before = await snapshot(surface, true);
  expect(Object.keys(before).length, `${label}: no visible button to probe`).toBeGreaterThan(0);
  await change();
  const after = await snapshot(surface, false);
  expect(diffBoxes(before, after), `${label}: buttons moved`).toEqual([]);
}
