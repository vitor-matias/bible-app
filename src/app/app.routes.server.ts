import { PrerenderFallback, RenderMode, type ServerRoute } from "@angular/ssr"
import { fetchPrerenderChapterParams } from "./prerender-params"

export const serverRoutes: ServerRoute[] = [
  { path: "", renderMode: RenderMode.Prerender },
  // The book index links every book, so it must be in the crawlable HTML.
  { path: "livros", renderMode: RenderMode.Prerender },
  // Search results are user-specific and noindexed.
  { path: "search", renderMode: RenderMode.Client },
  {
    path: ":book/:chapter",
    renderMode: RenderMode.Prerender,
    // Unknown combinations, or builds without API access, render client-side.
    fallback: PrerenderFallback.Client,
    getPrerenderParams: () => fetchPrerenderChapterParams(),
  },
  { path: "**", renderMode: RenderMode.Client },
]
