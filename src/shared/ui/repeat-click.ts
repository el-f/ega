/** How long after a click the button's new action ignores the rest of a double-click. */
export const REPEAT_CLICK_MS = 400;

/**
 * For a button that flips its action in place (Test now / Stop, Stop / Retry, Record / Cancel): the second click of a
 * double-click lands on the new action. A click that continues a click run (detail > 1) is dropped when it comes
 * within REPEAT_CLICK_MS of the last click that acted, or of the first click a new button saw (a reply's new Stop).
 * Keyboard clicks have detail 0 and always act; a click run slower than that acts again.
 */
export function repeatClickGuard(): (e: MouseEvent) => boolean {
  let since: number | undefined;
  return (e) => {
    if (e.detail > 1 && (since === undefined || e.timeStamp - since < REPEAT_CLICK_MS)) {
      since ??= e.timeStamp;
      return true;
    }
    since = e.timeStamp;
    return false;
  };
}
