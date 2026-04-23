import { ChangeDetectionStrategy, Component, signal } from "@angular/core"
import { MatButtonModule } from "@angular/material/button"
import { PreferencesService } from "../../services/preferences.service"

@Component({
  selector: "app-consent-banner",
  templateUrl: "./consent-banner.component.html",
  styleUrl: "./consent-banner.component.css",
  standalone: true,
  imports: [MatButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConsentBannerComponent {
  visible = signal(false)

  constructor(private preferences: PreferencesService) {
    if (typeof window !== "undefined") {
      this.visible.set(!this.preferences.getTermsAccepted())
    }
  }

  accept(): void {
    this.preferences.setTermsAccepted()
    this.visible.set(false)
  }
}
