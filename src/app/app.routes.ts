import { type Routes } from "@angular/router"
import { BibleReaderComponent } from "./components/bible-reader/bible-reader.component"

export const routes: Routes = [
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
