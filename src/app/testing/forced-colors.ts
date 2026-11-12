/// <reference types="@vitest/browser-playwright" />
import { cdp } from "vitest/browser"

/**
 * Emulates a forced-colours mode (Windows' contrast themes), or ends it. The
 * computed styles then show the colours the mode paints.
 */
export async function forceColors(active: boolean): Promise<void> {
  await cdp().send("Emulation.setEmulatedMedia", {
    features: active ? [{ name: "forced-colors", value: "active" }] : [],
  })
}

/** A system colour ("Highlight", "CanvasText") as the computed styles give it. */
export function systemColor(name: string): string {
  const probe = document.createElement("span")
  probe.style.color = name
  document.body.appendChild(probe)
  const color = getComputedStyle(probe).color
  probe.remove()
  return color
}
