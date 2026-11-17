import { DestroyRef, Injectable, inject } from "@angular/core"
import { takeUntilDestroyed } from "@angular/core/rxjs-interop"
import { MatDialog, MatDialogState } from "@angular/material/dialog"
import {
  NavigationCancel,
  NavigationEnd,
  NavigationError,
  NavigationSkipped,
  Router,
} from "@angular/router"
import { filter, type Observable, take } from "rxjs"
import {
  historyDepth,
  isPanelEntry,
  setPanelPopFilter,
} from "./depth-location-strategy"

/** Closes one open panel; returns whether it closed anything. */
export type BackCloser = () => boolean

/** Anything dismissable with an "after dismissed" stream, e.g. a bottom sheet. */
export interface DismissableRef {
  dismiss(): void
  afterDismissed(): Observable<unknown>
}

/**
 * Panels the back button should close before it navigates, such as the
 * reader's book drawer, the header menu, open bottom sheets and dialogs:
 * Android's back button, and on the website the browser's (closeOnBrowserBack).
 */
@Injectable({
  providedIn: "root",
})
export class BackButtonService {
  private readonly dialog = inject(MatDialog)
  private readonly router = inject(Router)
  private readonly destroyRef = inject(DestroyRef)
  // Wrapped so each registration is its own entry, even for the same closer.
  private readonly entries: { closer: BackCloser; isOpen: () => boolean }[] = []
  private browserBack = false
  private syncQueued = false
  /** Set while the history goes back over a panel entry nothing needs now. */
  private leavingPanelEntry = false
  /** The current history entry as last seen: a pop says where it went. */
  private current: HistoryEntry = { state: null, href: "" }

  /**
   * Registers a closer; call the returned function to unregister it.
   * `isOpen` says whether its panel is open, for the browser's Back; without
   * it, the panel is open for as long as it is registered.
   */
  register(closer: BackCloser, isOpen: () => boolean = () => true): () => void {
    const entry = { closer, isOpen }
    this.entries.push(entry)
    return () => {
      const index = this.entries.indexOf(entry)
      if (index !== -1) this.entries.splice(index, 1)
    }
  }

  /** Lets the back button dismiss `ref` until it is dismissed. */
  closeOnBack(ref: DismissableRef): void {
    let dismissing = false
    // Closed from inside too (a reference followed, a ribbon chosen): its
    // entry mustn't come back while the sheet slides away.
    const dismiss = ref.dismiss.bind(ref)
    ref.dismiss = () => {
      dismissing = true
      dismiss()
      this.changed()
    }
    const unregister = this.register(
      () => {
        ref.dismiss()
        return true
      },
      () => !dismissing,
    )
    this.changed()
    ref
      .afterDismissed()
      .pipe(take(1))
      .subscribe(() => {
        unregister()
        this.changed()
      })
  }

  /**
   * Closes the topmost dialog, or else tries the closers from the most
   * recently registered one, which belongs to the innermost component, and
   * stops at the first that closed a panel.
   */
  closeTopmost(): boolean {
    const dialogs = this.dialog.openDialogs
    if (dialogs.length > 0) {
      dialogs[dialogs.length - 1].close()
      return true
    }
    for (let i = this.entries.length - 1; i >= 0; i--) {
      if (this.entries[i].closer()) return true
    }
    return false
  }

  /**
   * On the website, has the browser's Back close an open panel first, as
   * Android's does: while one is open, the history has an entry of its own
   * on top, at the same address, which Back leaves. Not for the apps, whose
   * back button is native.
   */
  closeOnBrowserBack(): void {
    this.browserBack = true
    this.current = here()
    // Onto or off a panel's entry the page stays: Location doesn't pass the
    // pop on to the router (DepthLocationStrategy), which navigated when a
    // page had written the address itself (the index's themes, the reader's
    // notes) and its own URL was behind. Location's listener runs first (the
    // router made it before this service), while `current` is the left entry.
    setPanelPopFilter((state) =>
      isPanelStep(this.current, { state, href: window.location.href }),
    )
    const onPopState = (event: PopStateEvent) => {
      this.current = { state: event.state, href: window.location.href }
      if (this.leavingPanelEntry) {
        this.leavingPanelEntry = false
      } else if (this.anyOpen()) {
        this.closeTopmost()
      }
      this.changed()
    }
    window.addEventListener("popstate", onPopState)
    this.destroyRef.onDestroy(() => {
      this.browserBack = false
      setPanelPopFilter(null)
      window.removeEventListener("popstate", onPopState)
    })
    this.dialog.afterOpened
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((ref) => {
        this.changed()
        ref.afterClosed().subscribe(() => this.changed())
      })
    this.router.events
      .pipe(
        filter(
          (event) =>
            event instanceof NavigationEnd ||
            event instanceof NavigationCancel ||
            event instanceof NavigationError ||
            event instanceof NavigationSkipped,
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => {
        // A page opened from a panel took its entry (DepthLocationStrategy).
        this.current = here()
        this.changed()
      })
    // A reload keeps the entry of a panel that is no longer open.
    this.changed()
  }

  /** Call when a panel opens or closes, for the browser's Back. */
  changed(): void {
    if (!this.browserBack || this.syncQueued) return
    this.syncQueued = true
    // After the current task, so a panel closing for another to open (the
    // drawer switching to chapters) or for a navigation doesn't count.
    setTimeout(() => {
      this.syncQueued = false
      if (this.browserBack) this.syncHistory()
    })
  }

  /** Adds the panels' entry while one is open, and leaves it once none is. */
  private syncHistory(): void {
    // A navigation takes the panel's entry over (DepthLocationStrategy); its
    // end syncs again.
    if (this.router.currentNavigation()) return
    const state: unknown = window.history.state
    const open = this.anyOpen()
    if (open && !isPanelEntry(state)) {
      window.history.pushState(
        {
          ...(state && typeof state === "object" ? state : {}),
          appDepth: historyDepth(state) + 1,
          appPanel: true,
        },
        "",
      )
      this.current = here()
    } else if (!open && isPanelEntry(state) && !this.leavingPanelEntry) {
      this.leavingPanelEntry = true
      window.history.back()
    }
  }

  private anyOpen(): boolean {
    return (
      this.dialog.openDialogs.some(
        (ref) => ref.getState() === MatDialogState.OPEN,
      ) || this.entries.some((entry) => entry.isOpen())
    )
  }
}

interface HistoryEntry {
  state: unknown
  href: string
}

function here(): HistoryEntry {
  return { state: window.history.state, href: window.location.href }
}

/** Between a panel's entry and its page's, the one just beneath it. */
function isPanelStep(from: HistoryEntry, to: HistoryEntry): boolean {
  const [panel, page] = isPanelEntry(from.state) ? [from, to] : [to, from]
  return (
    from.href === to.href &&
    isPanelEntry(panel.state) &&
    !isPanelEntry(page.state) &&
    historyDepth(panel.state) === historyDepth(page.state) + 1
  )
}
