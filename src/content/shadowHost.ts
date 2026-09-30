import css from './shadow.css?inline';

const HOST_ID = 'ega-shadow-host';
let host: HTMLDivElement | null = null;
let root: ShadowRoot | null = null;
const disposers = new Set<() => void>();
const mountedCallbacks = new Set<(host: HTMLDivElement) => void>();

/** Unmount everything you put in the root. Runs when the page detaches the host; must not mount anything. */
export function onShadowHostRemount(dispose: () => void): void {
  disposers.add(dispose);
}

/** Fires after a host element is (re)built — lets the theme mirror re-attach to the live element. */
export function onShadowHostMounted(cb: (host: HTMLDivElement) => void): void {
  mountedCallbacks.add(cb);
}

export function mountShadowHost(): HTMLDivElement {
  // Reuse only the host this module created — any page can ship a decoy carrying our id.
  if (host?.isConnected) return host;
  if (host) {
    // Components left in the detached root keep their document listeners and observers registered.
    host = null;
    root = null;
    for (const dispose of disposers) dispose();
  }
  host = document.createElement('div');
  host.id = HOST_ID;
  host.style.cssText =
    'all: initial; position: fixed; top: 0; left: 0; width: 0; height: 0; z-index: 2147483647;';
  document.documentElement.appendChild(host);
  // Open mode: the tree holds only visible UI, and tests probe it via host.shadowRoot.
  root = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = css;
  root.appendChild(style);
  const container = document.createElement('div');
  container.className = 'ega-root';
  container.dataset['egaRoot'] = 'true';
  root.appendChild(container);
  // Seed from the page attribute for the gap until onShadowHostMounted re-runs the theme mirror.
  const docTheme = document.documentElement.dataset['theme'];
  if (docTheme === 'light' || docTheme === 'dark') host.dataset['theme'] = docTheme;
  document.documentElement.setAttribute('data-ega-host-installed', '');
  for (const cb of mountedCallbacks) cb(host);
  return host;
}

/** The theme helper sets data-theme here; the shadow tree inherits the tokens. */
export function getShadowHostElement(): HTMLDivElement | null {
  return host;
}

export function getShadowRoot(): ShadowRoot {
  // A non-null `root` is not proof of a live tree; the page can detach the host.
  if (!root || !host?.isConnected) mountShadowHost();
  return root as ShadowRoot;
}

export function getContainer(): HTMLDivElement {
  const r = getShadowRoot();
  const existing = r.querySelector<HTMLDivElement>('[data-ega-root]');
  if (existing) return existing;
  // A page script can reach into an open shadow root and delete the container.
  const container = document.createElement('div');
  container.className = 'ega-root';
  container.dataset['egaRoot'] = 'true';
  r.appendChild(container);
  return container;
}

/** The container as it stands, or null when none was built — for cleanup paths that must not force a mount. */
export function peekContainer(): HTMLDivElement | null {
  return root?.querySelector<HTMLDivElement>('[data-ega-root]') ?? null;
}
