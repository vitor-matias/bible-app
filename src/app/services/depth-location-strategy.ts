import {
  type LocationChangeListener,
  PathLocationStrategy,
  PlatformLocation,
} from "@angular/common"
import { Injectable, inject } from "@angular/core"

/**
 * How many of the app's own pages lie behind a history entry, from the
 * depth DepthLocationStrategy keeps in its state; 0 for an entry without one.
 */
export function historyDepth(state: unknown): number {
  const depth = (state as { appDepth?: unknown } | null)?.appDepth
  return typeof depth === "number" && depth > 0 ? depth : 0
}

/** Whether a history entry is an open panel's own (BackButtonService). */
export function isPanelEntry(state: unknown): boolean {
  return (state as { appPanel?: unknown } | null)?.appPanel === true
}

/**
 * The depth of the page an entry shows: a panel's entry sits one above the
 * page's own, at the same address.
 */
export function pageDepth(state: unknown): number {
  return historyDepth(state) - (isPanelEntry(state) ? 1 : 0)
}

/**
 * Router `state` of a navigation back to the page shown when the page asked
 * for failed to load: when that page was opened from the one shown, the
 * history steps back to it instead of replacing the failed page's entry.
 */
export const REVERT_STATE = { appRevert: true }

function isRevert(state: unknown): boolean {
  return (state as { appRevert?: unknown } | null)?.appRevert === true
}

let panelPop: ((state: unknown) => boolean) | null = null
let closePanels: (() => void) | null = null
let pendingAppPops = 0
const appPops = new WeakSet<object>()

/**
 * Steps back through history for the app itself, not for the reader: the pop
 * that follows reaches neither the router nor the panels (isAppPop).
 */
export function stepBack(back: () => void): void {
  pendingAppPops++
  back()
}

/**
 * Whether a popstate is one the app asked for (stepBack). Every listener of
 * the same event gets the same answer: the first to ask takes the step.
 */
/** Whether a step back the app asked for hasn't popped yet. */
export function appPopPending(): boolean {
  return pendingAppPops > 0
}

export function isAppPop(event: object): boolean {
  if (appPops.has(event)) return true
  if (pendingAppPops === 0) return false
  pendingAppPops--
  appPops.add(event)
  return true
}

/** Sets what closes the open panels when their page goes (BackButtonService). */
export function setPanelsCloser(close: (() => void) | null): void {
  closePanels = close
}

/**
 * Sets what says a popstate only went onto or off a panel's entry, which
 * Location then keeps from the router (BackButtonService); null for none.
 */
export function setPanelPopFilter(
  filter: ((state: unknown) => boolean) | null,
): void {
  panelPop = filter
}

/**
 * The router's location strategy, also keeping in each history entry how
 * many of the app's pages lie behind it, and keeping from Location the pops
 * that only open or close a panel.
 *
 * Android's WebView, like Chrome, skips on Back an entry the page left
 * without a tap on the page itself, and the native bars' buttons are not
 * taps on the page. On a fresh launch, after Search from the native bar, the
 * WebView said it could not go back, and Back offered to leave the app.
 */
@Injectable()
export class DepthLocationStrategy extends PathLocationStrategy {
  private readonly platform = inject(PlatformLocation)
  /** The address the last page pushed was opened from, and that page's depth. */
  private pushedFrom?: { path: string; depth: number }

  override onPopState(fn: LocationChangeListener): void {
    super.onPopState((event) => {
      if (
        event.type === "popstate" &&
        (isAppPop(event) || panelPop?.(event.state))
      ) {
        return
      }
      fn(event)
    })
  }

  override pushState(
    state: unknown,
    title: string,
    url: string,
    queryParams: string,
  ): void {
    const current = this.platform.getState()
    this.pushedFrom = { path: this.path(), depth: pageDepth(current) + 1 }
    // A page opened from a panel takes the panel's entry, already one deeper:
    // Back from it returns to the page under the panel, not to the panel.
    if (isPanelEntry(current)) {
      super.replaceState(
        withDepth(state, historyDepth(current)),
        title,
        url,
        queryParams,
      )
      return
    }
    super.pushState(
      withDepth(state, historyDepth(current) + 1),
      title,
      url,
      queryParams,
    )
  }

  override replaceState(
    state: unknown,
    title: string,
    url: string,
    queryParams: string,
  ): void {
    const current = this.platform.getState()
    // As this.path() reads it: no origin, which a full base href adds.
    const external = this.prepareExternalUrl(
      url +
        (queryParams && !queryParams.startsWith("?") ? "?" : "") +
        queryParams,
    ).replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*/i, "")
    // A page that failed to load, reverted to the one it was opened from
    // (REVERT_STATE): the history goes back to that page's entry, as it was
    // before the attempt. Replaced, the same chapter came twice, and Back
    // seemed to do nothing.
    const reverting =
      isRevert(state) &&
      this.pushedFrom?.depth === pageDepth(current) &&
      this.pushedFrom.path.split("?")[0] === external.split("?")[0]
    // Another page in place of the one under a panel (a chapter that failed to
    // load, reverted): the panel's entry goes first, as Back would close the
    // panel, and the page's own entry takes the new address. Left on the
    // panel's entry, it put the page before it a step back.
    const overPanel = isPanelEntry(current) && external !== this.path()
    const steps = (reverting ? 1 : 0) + (overPanel ? 1 : 0)
    if (steps > 0) {
      // The panels open now go with it; one opened from here on (the linked
      // notes) stays, and takes an entry of its own.
      if (overPanel) closePanels?.()
      const stop = this.platform.onPopState(() => {
        stop()
        super.replaceState(
          withDepth(state, historyDepth(current) - steps),
          title,
          url,
          queryParams,
        )
      })
      stepBack(() => this.platform.historyGo?.(-steps))
      return
    }
    const next = withDepth(state, historyDepth(current))
    // Still the open panel's entry, which Back leaves to close it.
    super.replaceState(
      isPanelEntry(current) ? { ...next, appPanel: true } : next,
      title,
      url,
      queryParams,
    )
  }
}

/** The state with this depth, and never a panel's flag: only replaceState
 *  keeps that, on the panel's own entry. */
function withDepth(state: unknown, appDepth: number): object {
  const {
    appPanel: _,
    appRevert: __,
    ...rest
  } = (state && typeof state === "object" ? state : {}) as {
    appPanel?: unknown
    appRevert?: unknown
  }
  return { ...rest, appDepth }
}
