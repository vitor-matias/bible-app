import { Injectable, inject } from "@angular/core"
import { OnboardingService } from "./onboarding.service"
import { PreferencesService } from "./preferences.service"

/** How many times the hint plays before it gives up on a reader who ignores it. */
export const PICKER_HINT_MAX = 3
/** How long a chapter has been open, with the reader not yet at the picker, before the hint. */
export const PICKER_HINT_DELAY_MS = 4000

/**
 * The hint that the passage in the header is a button: shown only to a reader
 * who has never opened the picker, a few times at most, and never over the
 * wizard. The web header plays its own; the apps' native bars play theirs.
 */
@Injectable({ providedIn: "root" })
export class PassagePickerHintService {
  private readonly preferences = inject(PreferencesService)
  private readonly onboarding = inject(OnboardingService)

  /** The reader opened the picker: it needs no hint. */
  markUsed(): void {
    this.preferences.setPassagePickerUsed()
  }

  /** Whether to play the hint now; if so, it counts as one showing. */
  claim(): boolean {
    if (this.preferences.getPassagePickerUsed() || this.onboarding.isOpen) {
      return false
    }
    const shown = this.preferences.getPassagePickerHints()
    if (shown >= PICKER_HINT_MAX) return false
    this.preferences.setPassagePickerHints(shown + 1)
    return true
  }
}
