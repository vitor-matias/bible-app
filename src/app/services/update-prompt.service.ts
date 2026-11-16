import { DOCUMENT, Injectable, inject } from "@angular/core"
import { MatBottomSheet } from "@angular/material/bottom-sheet"
import { MatDialog } from "@angular/material/dialog"
import { MatSnackBar } from "@angular/material/snack-bar"
import { SwUpdate } from "@angular/service-worker"
import { filter, switchMap, take, timer } from "rxjs"

/** How often a ready update looks again for a moment free of overlays. */
export const UPDATE_RETRY_MS = 5_000
export const UPDATE_PROMPT_DURATION_MS = 10_000

/**
 * The website's service worker keeps a tab on the code it loaded with until
 * a reload. Once a new version is downloaded, this offers it, without
 * covering a dialog, a sheet or another message. The native apps have no
 * service worker (SwUpdate is disabled there).
 */
@Injectable({
  providedIn: "root",
})
export class UpdatePromptService {
  private readonly swUpdate = inject(SwUpdate)
  private readonly snackBar = inject(MatSnackBar)
  private readonly dialog = inject(MatDialog)
  private readonly bottomSheet = inject(MatBottomSheet)
  private readonly document = inject(DOCUMENT)

  init(): void {
    if (!this.swUpdate.isEnabled) return
    this.swUpdate.versionUpdates
      .pipe(
        filter((event) => event.type === "VERSION_READY"),
        take(1),
        switchMap(() => timer(0, UPDATE_RETRY_MS)),
        filter(() => this.isFree()),
        take(1),
      )
      .subscribe(() => this.offer())
  }

  private isFree(): boolean {
    return (
      this.dialog.openDialogs.length === 0 &&
      // shortcut: Material has no public "is one open" (as in AppPromoService).
      !this.bottomSheet._openedBottomSheetRef &&
      !this.snackBar._openedSnackBarRef &&
      this.document.visibilityState !== "hidden"
    )
  }

  private offer(): void {
    this.snackBar
      .open("Nova versão disponível", "Atualizar", {
        duration: UPDATE_PROMPT_DURATION_MS,
      })
      .onAction()
      .subscribe(() => {
        void this.swUpdate
          .activateUpdate()
          .catch(() => false)
          .then(() => this.document.location.reload())
      })
  }
}
