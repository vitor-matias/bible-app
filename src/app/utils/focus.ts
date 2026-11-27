/**
 * Focuses an element if focus was lost to the page (the body), as when the
 * control that had it was removed or the page under it changed. Focus the
 * reader moved elsewhere stays there.
 */
export function focusIfLost(element: HTMLElement | null | undefined): void {
  if (typeof document === "undefined" || !element) return
  const active = document.activeElement
  if (!active || active === document.body) element.focus()
}
