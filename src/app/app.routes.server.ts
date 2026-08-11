import { PrerenderFallback, RenderMode, type ServerRoute } from "@angular/ssr"
import { fetchPrerenderChapterParams } from "./prerender-params"

export const serverRoutes: ServerRoute[] = [
  // The home page is the most important URL to rank; prerender it so
  // crawlers get real content (About + book index) instead of the SPA shell.
  { path: "", renderMode: RenderMode.Prerender },
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
