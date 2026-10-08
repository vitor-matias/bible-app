import { Injectable, inject } from "@angular/core"
import { MatSnackBar } from "@angular/material/snack-bar"
import { NativeChromeService } from "./native-chrome.service"

export interface ToastOptions {
  /** The snackbar's button on the web; the iOS toast has none. */
  action?: string
  duration?: number
}

/**
 * A short message: a Material snackbar on the web and Android, a native glass
 * toast in the iOS app (NativeChromeService).
 */
@Injectable({
  providedIn: "root",
})
export class ToastService {
  private readonly snackBar = inject(MatSnackBar)
  private readonly nativeChrome = inject(NativeChromeService)

  show(message: string, options: ToastOptions = {}): void {
    if (this.nativeChrome.enabled) {
      this.nativeChrome.toast(message)
      return
    }
    this.snackBar.open(message, options.action ?? "Fechar", {
      duration: options.duration ?? 3000,
    })
  }
}
