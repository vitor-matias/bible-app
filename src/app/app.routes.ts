import { type Routes } from "@angular/router"
import { BibleReaderComponent } from "./components/bible-reader/bible-reader.component"

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
  { path: ":book/:chapter", component: BibleReaderComponent },
  { path: "**", component: BibleReaderComponent },
]
