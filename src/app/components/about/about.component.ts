import { ChangeDetectionStrategy, Component } from "@angular/core"
import { RouterLink } from "@angular/router"

@Component({
  selector: "about",
  imports: [RouterLink],
  templateUrl: "./about.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: "./about.component.css",
})
export class AboutComponent {}
