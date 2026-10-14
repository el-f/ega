const MIN_EDGE = 200;
const MIN_VIEWPORT_FRACTION = 0.15;
const AMBIGUITY_RATIO = 0.6;

/** The one large content image in root, or null when there is none or two compete, never a guess. */
export function findDominantPostImage(root: ParentNode = document.body): string | null {
  const viewportArea = Math.max(1, window.innerWidth * window.innerHeight);
  const large: { src: string; area: number }[] = [];
  for (const el of Array.from(root.querySelectorAll('img'))) {
    const r = el.getBoundingClientRect();
    if (r.width < MIN_EDGE || r.height < MIN_EDGE) continue;
    if ((r.width * r.height) / viewportArea < MIN_VIEWPORT_FRACTION) continue;
    const src = el.currentSrc || el.src;
    if (!src || src.startsWith('data:')) continue;
    large.push({ src, area: r.width * r.height });
  }
  if (large.length === 0) return null;
  large.sort((a, b) => b.area - a.area);
  const top = large[0];
  if (!top) return null;
  const runnerUp = large[1];
  if (runnerUp && runnerUp.area >= top.area * AMBIGUITY_RATIO) return null;
  return top.src;
}
