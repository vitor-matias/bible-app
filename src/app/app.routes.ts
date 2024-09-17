import { NgModule } from "@angular/core"
import { RouterModule, type Routes } from "@angular/router"
import { AppComponent } from "./app.component"

export const routes: Routes = [
  { path: ":book/:chapter", component: AppComponent },
  { path: ":book/:chapter/:verse", component: AppComponent },

  // Other routes
]

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule],
})
export class AppRoutingModule {}
