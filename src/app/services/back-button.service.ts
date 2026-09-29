import { Injectable } from "@angular/core"
import { type Observable, take } from "rxjs"

/** Closes one open panel; returns whether it closed anything. */
export type BackCloser = () => boolean

/** Anything dismissable with an "after dismissed" stream, e.g. a bottom sheet. */
export interface DismissableRef {
  dismiss(): void
  afterDismissed(): Observable<unknown>
}

/**
 * Panels the Android back button should close before it navigates, such as
 * the reader's book drawer, the header menu and open bottom sheets. Dialogs
 * are handled in AppComponent through MatDialog.openDialogs.
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

  /** Lets the back button dismiss `ref` until it is dismissed. */
  closeOnBack(ref: DismissableRef): void {
    const unregister = this.register(() => {
      ref.dismiss()
      return true
    })
    ref.afterDismissed().pipe(take(1)).subscribe(unregister)
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
