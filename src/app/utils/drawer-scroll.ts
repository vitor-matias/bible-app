import { DestroyRef, inject } from "@angular/core"
import { takeUntilDestroyed } from "@angular/core/rxjs-interop"
import { MatDrawer } from "@angular/material/sidenav"

/**
 * Runs `scroll` once each time the drawer around the caller starts opening.
 * A closed drawer's content is display: none, so a list built inside it has
 * nothing to scroll until then.
 *
 * The reader swaps the book and chapter lists as the drawer opens, so a list
 * can be created mid-opening, before or after that opening's openedStart. The
 * drawer queues openedStart on a timer before the list exists, and timers run
 * in order: the fallback below runs after it and scrolls only if it was missed.
 *
 * Call from an injection context. Returns whether there is a drawer.
 */
export function scrollOnDrawerOpen(scroll: () => void): boolean {
  const drawer = inject(MatDrawer, { optional: true })
  if (!drawer) return false
  const destroyRef = inject(DestroyRef)

  let openedSinceCreated = false
  drawer.openedStart.pipe(takeUntilDestroyed()).subscribe(() => {
    openedSinceCreated = true
    scroll()
  })
  if (drawer.opened) {
    const fallback = setTimeout(() => {
      if (!openedSinceCreated) scroll()
    })
    // A list swapped out again before it runs has nothing left to scroll.
    destroyRef.onDestroy(() => clearTimeout(fallback))
  }
  return true
}
