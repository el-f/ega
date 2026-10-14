let hookDispatching = false;

// A page can dispatch keydown and click to the content script's own listeners; only a real user gesture may start a request.
export function isUserGesture(e: Event): boolean {
  return e.isTrusted || __EGA_UNIT_TESTS__ || (__EGA_E2E_HOOKS__ && hookDispatching);
}

/** E2E hooks stand in for user input. The flag lives in the content script's world, so a page cannot raise it. */
export function dispatchAsUser(target: EventTarget, e: Event): void {
  hookDispatching = true;
  try {
    target.dispatchEvent(e);
  } finally {
    hookDispatching = false;
  }
}
