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

  /** Kept here too: a write that storage refuses still ends the hint for this session. */
  private usedThisSession = false

  /** The reader opened the picker: it needs no hint. */
  markUsed(): void {
    this.usedThisSession = true
    this.preferences.setPassagePickerUsed()
  }

  /**
   * What to do about the hint now: play it, wait (the wizard is up: try again
   * later), or done with it (the picker has been used, or this can't be
   * remembered).
   */
  claim(): "play" | "wait" | "done" {
    if (this.usedThisSession || this.preferences.getPassagePickerUsed()) {
      return "done"
    }
    return this.onboarding.isOpen ? "wait" : "play"
  }
}
