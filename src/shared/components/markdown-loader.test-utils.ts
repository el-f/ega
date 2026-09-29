import { markdownLoaderInternal } from './markdown-loader';

/** Test-only: drop the memoized renderer so the next loadMarkdownRenderer
 *  call re-imports `marked` + `dompurify`. Imported only by tests. */
export function resetMarkdownLoaderCache(): void {
  markdownLoaderInternal.cached = null;
}
