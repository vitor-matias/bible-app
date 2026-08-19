import { ChangeDetectionStrategy, Component } from "@angular/core"

@Component({
  selector: "about",
  imports: [],
  templateUrl: "./about.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: "./about.component.css",
})
export class AboutComponent {}
