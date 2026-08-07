import { PrerenderFallback, RenderMode, type ServerRoute } from "@angular/ssr"
import { fetchPrerenderChapterParams } from "./prerender-params"

export const serverRoutes: ServerRoute[] = [
  // Search results are user-specific and noindexed — never prerender.
  { path: "search", renderMode: RenderMode.Client },
  {
    path: ":book/:chapter",
    renderMode: RenderMode.Prerender,
    // Unknown combinations (or builds without API access) behave like the
    // plain SPA instead of failing.
    fallback: PrerenderFallback.Client,
    getPrerenderParams: () => fetchPrerenderChapterParams(),
  },
  { path: "**", renderMode: RenderMode.Client },
]
