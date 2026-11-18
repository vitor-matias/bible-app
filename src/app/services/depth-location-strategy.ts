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
    // Another page in place of the one under a panel (a chapter that failed to
    // load, reverted): the panel's entry goes first, as Back would close the
    // panel, and the page's own entry takes the new address. Left on the
    // panel's entry, it put the page before it a step back.
    if (isPanelEntry(current) && external !== this.path()) {
      // The panels open now go with it; one opened from here on (the linked
      // notes) stays, and takes an entry of its own.
      closePanels?.()
      const stop = this.platform.onPopState(() => {
        stop()
        super.replaceState(
          withDepth(state, historyDepth(current) - 1),
          title,
          url,
          queryParams,
        )
      })
      stepBack(() => this.platform.back())
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
  const { appPanel: _, ...rest } = (
    state && typeof state === "object" ? state : {}
  ) as { appPanel?: unknown }
  return { ...rest, appDepth }
}
