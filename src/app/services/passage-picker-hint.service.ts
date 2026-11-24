import { Injectable, inject } from "@angular/core"
import { OnboardingService } from "./onboarding.service"
import { PreferencesService } from "./preferences.service"

/** How long a chapter has been open, with the reader not yet at the picker, before the hint. */
export const PICKER_HINT_DELAY_MS = 4000

/**
 * The hint that the passage in the header is a button: shown to a reader who
 * has never opened the picker, each time the app or page opens, until they do,
 * and never over the wizard. The web header plays its own; the apps' native bars play theirs.
 */
@Injectable({ providedIn: "root" })
export class PassagePickerHintService {
  private readonly preferences = inject(PreferencesService)
  private readonly onboarding = inject(OnboardingService)

  /** The reader opened the picker: it needs no hint. */
  markUsed(): void {
    this.preferences.setPassagePickerUsed()
  }

  /** Whether to play the hint now. */
  claim(): boolean {
    return !this.preferences.getPassagePickerUsed() && !this.onboarding.isOpen
  }
}
