import { debugCatch } from '@/shared/logger';
import { mount, unmount } from 'svelte';
import Banner from './Banner.svelte';
import { getContainer, peekContainer, onShadowHostRemount } from './shadowHost';

interface BannerOpts {
  message: string;
  onDismiss?: () => void;
}

let currentHandle: ReturnType<typeof mount> | null = null;
let currentAnchor: HTMLDivElement | null = null;

export function showBanner(o: BannerOpts): void {
  hideBanner();
  const anchor = document.createElement('div');
  anchor.setAttribute('data-ega-banner', '');
  getContainer().appendChild(anchor);
  currentAnchor = anchor;
  currentHandle = mount(Banner, {
    target: anchor,
    props: {
      message: o.message,
      ondismiss: () => {
        o.onDismiss?.();
        hideBanner(anchor);
      },
    },
  });
}

function hideBanner(expectedAnchor?: HTMLDivElement): void {
  if (expectedAnchor && currentAnchor !== expectedAnchor) {
    return;
  }
  if (currentHandle) {
    try {
      void unmount(currentHandle);
    } catch (e) {
      debugCatch(e, 'content.banner.1');
    }
    currentHandle = null;
  }
  if (currentAnchor) {
    currentAnchor.remove();
    currentAnchor = null;
  }
  peekContainer()
    ?.querySelectorAll('[data-ega-banner]')
    .forEach((n) => n.remove());
}

onShadowHostRemount(hideBanner);
