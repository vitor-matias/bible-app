import { Injectable, inject, signal } from "@angular/core"
import { MatBottomSheet } from "@angular/material/bottom-sheet"
import type { PluginListenerHandle } from "@capacitor/core"
import type { OnboardingResult } from "../components/onboarding/onboarding.component"
import type { NativeOnboardingStep } from "../components/onboarding/onboarding-content"
import {
  PassagePickerSheetComponent,
  type PickedPassage,
} from "../components/passage-picker-sheet/passage-picker-sheet.component"
import type { PassagePickerData } from "../utils/passage-picker"
import { BackButtonService } from "./back-button.service"
import type {
  ChromeInsets,
  NativeChromeAction,
  NativeChromePlugin,
  NativeChromeState,
  SheetPresented,
} from "./native-chrome.service"

/**
 * The iOS app's bars, drawn by the page: what NativeChromeService drives in
 * the Android app and on phones, through the same interface as the iOS shell.
 * ChromeBarsComponent renders `state` and reports taps and its size here;
 * the passage picker is a bottom sheet with the iOS picker's contents.
 *
 * The iOS shell's other sheets (bookmarks, notes, reports, toasts, the
 * onboarding) stay the web app's own: NativeChromeService only asks for them
 * in the iOS app, so these answer "not presented".
 */
@Injectable({
  providedIn: "root",
})
export class WebChromeBars implements NativeChromePlugin {
  private readonly bottomSheet = inject(MatBottomSheet)
  private readonly backButton = inject(BackButtonService)
  private readonly actionListeners = new Set<
    (action: NativeChromeAction) => void
  >()
  private readonly insetsListeners = new Set<(insets: ChromeInsets) => void>()
  private insets: ChromeInsets = { top: 0, bottom: 0 }
  /** setState calls waiting for the bars they asked for to be measured. */
  private pendingStates: ((insets: ChromeInsets) => void)[] = []

  /** What the bars show; ChromeBarsComponent renders it. */
  readonly state = signal<NativeChromeState>({ mode: "none" })

  /**
   * Resolves with the space the new bars cover, once they have rendered: an
   * answer from before would land after the measurement and undo it.
   */
  setState(state: NativeChromeState): Promise<ChromeInsets> {
    this.state.set(state)
    return new Promise((resolve) => this.pendingStates.push(resolve))
  }

  /**
   * From ChromeBarsComponent after each render: the space its bars cover.
   * Answers the states waiting for it, and tells listeners when it changed.
   */
  reportInsets(insets: ChromeInsets): void {
    const pending = this.pendingStates
    this.pendingStates = []
    for (const resolve of pending) resolve(insets)
    if (
      insets.top === this.insets.top &&
      insets.bottom === this.insets.bottom
    ) {
      return
    }
    this.insets = insets
    for (const listener of this.insetsListeners) listener(insets)
  }

  /** From ChromeBarsComponent: a tap on a bar, its menus or the search field. */
  send(action: NativeChromeAction): void {
    for (const listener of this.actionListeners) listener(action)
  }

  showPicker(data: PassagePickerData): Promise<void> {
    const sheet = this.bottomSheet.open<
      PassagePickerSheetComponent,
      PassagePickerData,
      PickedPassage
    >(PassagePickerSheetComponent, {
      data,
      panelClass: "passage-picker-panel",
      ariaLabel: "Escolher livro e capítulo",
    })
    this.backButton.closeOnBack(sheet)
    sheet.afterDismissed().subscribe((picked) => {
      if (picked) this.send({ id: "goto", ...picked })
    })
    return Promise.resolve()
  }

  addListener(
    eventName: "action",
    listener: (action: NativeChromeAction) => void,
  ): Promise<PluginListenerHandle>
  addListener(
    eventName: "insets",
    listener: (insets: ChromeInsets) => void,
  ): Promise<PluginListenerHandle>
  addListener(
    eventName: "action" | "insets",
    listener:
      | ((action: NativeChromeAction) => void)
      | ((insets: ChromeInsets) => void),
  ): Promise<PluginListenerHandle> {
    const listeners = (
      eventName === "action" ? this.actionListeners : this.insetsListeners
    ) as Set<typeof listener>
    listeners.add(listener)
    return Promise.resolve({
      remove: async () => {
        listeners.delete(listener)
      },
    })
  }

  showBookmarks(): Promise<SheetPresented> {
    return Promise.resolve({ presented: false })
  }

  updateBookmarks(): Promise<void> {
    return Promise.resolve()
  }

  showFootnotes(): Promise<SheetPresented> {
    return Promise.resolve({ presented: false })
  }

  showToast(): Promise<void> {
    return Promise.resolve()
  }

  showReport(): Promise<SheetPresented> {
    return Promise.resolve({ presented: false })
  }

  finishReport(): Promise<void> {
    return Promise.resolve()
  }

  showOnboarding(options: {
    steps: NativeOnboardingStep[]
  }): Promise<OnboardingResult> {
    return Promise.resolve({
      completed: false,
      lastStep: options.steps[0]?.id ?? "",
    })
  }
}
