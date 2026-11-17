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

let panelPop: ((state: unknown) => boolean) | null = null

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
      if (event.type === "popstate" && panelPop?.(event.state)) return
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

function withDepth(state: unknown, appDepth: number): object {
  return { ...(state && typeof state === "object" ? state : {}), appDepth }
}
