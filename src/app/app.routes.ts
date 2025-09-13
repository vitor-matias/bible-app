import { NgModule } from "@angular/core"
import { RouterModule, type Routes } from "@angular/router"
import { BibleReaderComponent } from "./components/bible-reader/bible-reader.component"
import { SearchComponent } from "./components/search/search.component"

export const routes: Routes = [
  { path: "search", component: SearchComponent },
  { path: ":book/:chapter", component: BibleReaderComponent },
  { path: "**", component: BibleReaderComponent },
]

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule],
})
export class AppRoutingModule {}
