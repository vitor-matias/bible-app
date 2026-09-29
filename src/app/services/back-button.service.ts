import { Injectable } from "@angular/core"

/** Closes one open panel; returns whether it closed anything. */
export type BackCloser = () => boolean

/**
 * Panels the Android back button should close before it navigates, such as
 * the reader's book drawer and the header menu. Dialogs and bottom sheets
 * are handled in AppComponent through MatDialog and MatBottomSheet.
 */
@Injectable({
  providedIn: "root",
})
export class BackButtonService {
  private readonly closers: BackCloser[] = []

  /** Registers a closer; call the returned function to unregister it. */
  register(closer: BackCloser): () => void {
    this.closers.push(closer)
    return () => {
      const index = this.closers.indexOf(closer)
      if (index !== -1) this.closers.splice(index, 1)
    }
  }

  /**
   * Tries the closers from the most recently registered one, which belongs
   * to the innermost component, and stops at the first that closed a panel.
   */
  closeTopmost(): boolean {
    for (let i = this.closers.length - 1; i >= 0; i--) {
      if (this.closers[i]()) return true
    }
    return false
  }
}
