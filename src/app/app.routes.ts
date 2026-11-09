import { type Routes } from "@angular/router"
import { chapterExists } from "./chapter-exists.guard"
import { BibleReaderComponent } from "./components/bible-reader/bible-reader.component"
import {
  APP_STORE_URL,
  PLAY_STORE_URL,
  redirectTo,
} from "./store-redirect.guard"

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
  { path: "android", canActivate: [redirectTo(PLAY_STORE_URL)], children: [] },
  { path: "ios", canActivate: [redirectTo(APP_STORE_URL)], children: [] },
  {
    path: "indice",
    loadComponent: () =>
      import("./components/pastoral-index/pastoral-index.component").then(
        (m) => m.PastoralIndexComponent,
      ),
  },
  {
    path: "indice/:slug",
    loadComponent: () =>
      import("./components/pastoral-index/pastoral-index.component").then(
        (m) => m.PastoralIndexComponent,
      ),
  },
  {
    path: "minhas-notas",
    loadComponent: () =>
      import("./components/my-notes/my-notes.component").then(
        (m) => m.MyNotesComponent,
      ),
  },
  {
    path: ":book/:chapter",
    component: BibleReaderComponent,
    canMatch: [chapterExists],
  },
  {
    // Two segments that failed the guard: a book or chapter that does not exist.
    path: ":book/:chapter",
    loadComponent: () =>
      import("./components/not-found/not-found.component").then(
        (m) => m.NotFoundComponent,
      ),
  },
  { path: "**", component: BibleReaderComponent },
]
