import type { SheetPresented } from "./native-chrome.types"

/**
 * The section headings in the reader's text and in an introduction, which
 * mark themselves: a verse's own heading is inline (verse-section).
 */
const SECTION_HEADINGS = "[data-section-heading]"

/** Steps the progress line moves in: finer would cross the bridge for nothing. */
const PROGRESS_STEPS = 500

/**
 * How far through its content `element` has scrolled, 0 to 1: across, for the
 * reader's pages, else down. Whichever way it scrolls further, in screens: a
 * chapter's text can overhang its column by a few pixels (Génesis 1 and 2 on a
 * Pixel 9), which made it scroll across too. Null when it doesn't scroll.
 */
export function scrollProgress(element: Element): number | null {
  const across = element.scrollWidth - element.clientWidth
  const down = element.scrollHeight - element.clientHeight
  const horizontal =
    across > 1 &&
    across / Math.max(element.clientWidth, 1) >
      down / Math.max(element.clientHeight, 1)
  const extent = horizontal ? down : across
  if (extent <= 1) return null
  const progress = (horizontal ? element.scrollLeft : element.scrollTop) / extent
  return (
    Math.round(Math.min(Math.max(progress, 0), 1) * PROGRESS_STEPS) /
    PROGRESS_STEPS
  )
}

/**
 * The heading of the section being read in `element`: the last one that has
 * gone up past `line` (the top bar's lower edge), or, in pages, onto a page
 * before the one in view. Null before the first.
 */
export function currentSectionHeading(
  element: Element,
  line: number,
): string | null {
  const viewLeft = element.getBoundingClientRect().left
  let current: string | null = null
  for (const heading of element.querySelectorAll(SECTION_HEADINGS)) {
    const rect = heading.getBoundingClientRect()
    // Not laid out: a heading hidden with its page.
    if (rect.width === 0 && rect.height === 0) continue
    if (rect.bottom <= line || rect.right <= viewLeft) {
      current = heading.textContent?.replace(/\s+/g, " ").trim() || current
    } else {
      // In reading order: the rest come later.
      break
    }
  }
  return current
}

/** A sheet call's answer as a boolean; a failed call showed nothing. */
export function presented(call: Promise<SheetPresented>): Promise<boolean> {
  return call.then(
    (result) => result?.presented === true,
    () => false,
  )
}
