import { inject } from "@angular/core"
import { type Routes } from "@angular/router"
import { chapterExists } from "./chapter-exists.guard"
import { BibleReaderComponent } from "./components/bible-reader/bible-reader.component"
import { NativeChromeService } from "./services/native-chrome.service"
import {
  APP_STORE_URL,
  PLAY_STORE_URL,
  redirectTo,
} from "./store-redirect.guard"

const loadIndexPage = () =>
  import("./components/pastoral-index/pastoral-index.component").then(
    (m) => m.PastoralIndexComponent,
  )

export const routes: Routes = [
  // Explicit home route so the prerenderer can render "/" as a real page
  // (the ** fallback below would otherwise be its only match).
  { path: "", component: BibleReaderComponent, pathMatch: "full" },
  {
    path: "search",
    loadComponent: () =>
      import("./components/search/search.component").then(
        (m) => m.SearchComponent,
      ),
  },
  {
    path: "livros",
    loadComponent: () =>
      import("./components/book-index/book-index.component").then(
        (m) => m.BookIndexComponent,
      ),
  },
  {
    path: "app",
    loadComponent: () =>
      import("./components/landing/landing.component").then(
        (m) => m.LandingComponent,
      ),
  },
  { path: "android", canActivate: [redirectTo(PLAY_STORE_URL)], children: [] },
  { path: "ios", canActivate: [redirectTo(APP_STORE_URL)], children: [] },
  // The web hosts the index in the reader, under its header and beside its
  // book list. The page's own chunk resolves before the reader shows, so the
  // prerender renders the themes and the browser hydrates them (a @defer
  // block renders only its placeholder there without incremental hydration).
  ...["indice", "indice/:slug"].map((path) => ({
    path,
    component: BibleReaderComponent,
    // Tells the page it is hosted (PastoralIndexComponent).
    data: { index: true },
    canMatch: [() => !inject(NativeChromeService).enabled],
    resolve: { indexPage: loadIndexPage },
  })),
  // The native apps draw the page's bars themselves.
  {
    path: "indice",
    loadComponent: loadIndexPage,
  },
  {
    path: "indice/:slug",
    loadComponent: loadIndexPage,
  },
  {
    path: "365",
    // Web only until the apps' own +365 players (PodcastChrome) ship with
    // them: an App Link to /365 lands on the not-found page there.
    canMatch: [() => !inject(NativeChromeService).enabled],
    loadComponent: () =>
      import("./components/mais365/mais365.component").then(
        (m) => m.Mais365Component,
      ),
  },
  {
    path: ":book/:chapter",
    component: BibleReaderComponent,
    canMatch: [chapterExists],
  },
  {
    // Anything else: two segments that failed the guard (a book or chapter
    // that does not exist), or a path no page has ("/xyz", "/jo/3/4"). The
    // address stays as typed.
    path: "**",
    loadComponent: () =>
      import("./components/not-found/not-found.component").then(
        (m) => m.NotFoundComponent,
      ),
  },
]
