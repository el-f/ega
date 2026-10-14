import { DEFAULT_POST_TEXT_CAP } from '@/shared/constants';

const CONTAINER_SELECTOR =
  'article, [role="article"], shreddit-post, [slot="post-container"], [data-testid="post-container"], [data-test-id="post-content"], .thing';
const MAX_HOPS = 12;
const MIN_FALLBACK_LEN = 200;

/** Text of the post/article block around the anchor (body, caption), or undefined when no large container is found. */
export function extractPostBlockText(
  anchorNode: Node,
  cap = DEFAULT_POST_TEXT_CAP,
): string | undefined {
  const el: HTMLElement | null =
    anchorNode.nodeType === Node.ELEMENT_NODE
      ? (anchorNode as HTMLElement)
      : anchorNode.parentElement;
  let container: HTMLElement | null =
    (el?.closest(CONTAINER_SELECTOR) as HTMLElement | null) ?? null;
  if (!container) {
    let hops = 0;
    let cur = el;
    while (cur && hops < MAX_HOPS) {
      if (cur.textContent.replace(/\s+/g, ' ').trim().length >= MIN_FALLBACK_LEN) {
        container = cur;
        break;
      }
      cur = cur.parentElement;
      hops++;
    }
  }
  if (!container) return undefined;
  const text = container.textContent.replace(/\s+/g, ' ').trim();
  if (!text) return undefined;
  return text.length > cap ? text.slice(0, cap) : text;
}
