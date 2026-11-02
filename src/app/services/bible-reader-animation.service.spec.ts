import { TestBed } from "@angular/core/testing"
import { lastCall } from "../testing/spy-obj"
import {
  BibleReaderAnimationService,
  HIGHLIGHT_CLASS,
  HIGHLIGHT_DURATION_MS,
  LAYOUT_SETTLE_MS,
} from "./bible-reader-animation.service"

describe("BibleReaderAnimationService", () => {
  beforeEach(() => {
    vi.useFakeTimers({ advanceTimeDelta: 1, shouldAdvanceTime: true })
  })
  afterEach(() => {
    vi.useRealTimers()
  })
  let service: BibleReaderAnimationService

  beforeEach(() => {
    TestBed.configureTestingModule({})
    service = TestBed.inject(BibleReaderAnimationService)

    // Helper to mock requestAnimationFrame
    vi.spyOn(window, "requestAnimationFrame").mockImplementation(
      (cb: FrameRequestCallback) => {
        cb(0)
        return 0
      },
    )
  })

  it("should be created", () => {
    expect(service).toBeTruthy()
  })

  describe("scrollToTop", () => {
    it("should scroll to top in scrolling viewMode", async () => {
      const drawerContentRow = document.createElement("div")
      const containerRow = document.createElement("div")
      vi.spyOn(drawerContentRow, "scrollTo").mockReturnValue(undefined)
      vi.spyOn(service, "triggerSlideAnimation").mockReturnValue(undefined)

      service.scrollToTop(drawerContentRow, containerRow, "scrolling", false)

      await vi.advanceTimersByTimeAsync(0)
      expect(drawerContentRow.scrollTo).toHaveBeenCalledWith({
        top: 0,
        behavior: "smooth",
      })

      // We have another setTimeout inside for requestAnimationFrame which we can't easily mock tick
      // However we know it gets called. The best we can do is expect the first part.
    })

    it("should handle undefined elements without throwing", async () => {
      expect(() => {
        service.scrollToTop(undefined, undefined, "scrolling", false)
      }).not.toThrow()
      await vi.advanceTimersByTimeAsync(0)
    })

    it("should scroll to start in paged viewMode and startAtBottom false", async () => {
      const drawerContentRow = document.createElement("div")
      const containerRow = document.createElement("div")
      vi.spyOn(service, "triggerSlideAnimation").mockReturnValue(undefined)

      service.scrollToTop(drawerContentRow, containerRow, "paged", false)

      await vi.advanceTimersByTimeAsync(0)
      // inner setTimeout
      await vi.advanceTimersByTimeAsync(0)

      expect(containerRow.scrollLeft).toBe(0)
      expect(service.triggerSlideAnimation).toHaveBeenCalledWith(
        drawerContentRow,
        containerRow,
        false,
      )
    })

    it("should scroll to end in paged viewMode and startAtBottom true", async () => {
      const drawerContentRow = document.createElement("div")
      const containerRow = document.createElement("div")
      Object.defineProperty(containerRow, "scrollWidth", { value: 500 })
      Object.defineProperty(containerRow, "clientWidth", { value: 100 })
      let sl = 0
      Object.defineProperty(containerRow, "scrollLeft", {
        get: () => sl,
        set: (v) => {
          sl = v
        },
      })
      vi.spyOn(service, "triggerSlideAnimation").mockReturnValue(undefined)

      service.scrollToTop(drawerContentRow, containerRow, "paged", true)

      await vi.advanceTimersByTimeAsync(0)
      // inner setTimeout of 100ms
      await vi.advanceTimersByTimeAsync(100)

      expect(containerRow.scrollLeft).toBe(400)
      expect(service.triggerSlideAnimation).toHaveBeenCalledWith(
        drawerContentRow,
        containerRow,
        true,
      )
    })

    it("should scroll to 0 if maxScroll is negative in paged viewMode startAtBottom true", async () => {
      const drawerContentRow = document.createElement("div")
      const containerRow = document.createElement("div")
      Object.defineProperty(containerRow, "scrollWidth", { value: 100 })
      Object.defineProperty(containerRow, "clientWidth", { value: 500 })
      vi.spyOn(service, "triggerSlideAnimation").mockReturnValue(undefined)

      service.scrollToTop(drawerContentRow, containerRow, "paged", true)

      await vi.advanceTimersByTimeAsync(0)
      await vi.advanceTimersByTimeAsync(100)

      expect(containerRow.scrollLeft).toBe(0)
    })
  })

  describe("triggerSlideAnimation", () => {
    it("should add slide-in-left class when isBackward is true", async () => {
      const drawerContentRow = document.createElement("div")
      const containerRow = document.createElement("div")

      service.triggerSlideAnimation(drawerContentRow, containerRow, true)

      expect(containerRow.classList.contains("slide-in-left")).toBe(true)
      await vi.advanceTimersByTimeAsync(600)
      expect(containerRow.classList.contains("slide-in-left")).toBe(false)
    })

    it("should add slide-in-right class when isBackward is false", async () => {
      const drawerContentRow = document.createElement("div")
      const containerRow = document.createElement("div")

      service.triggerSlideAnimation(drawerContentRow, containerRow, false)

      expect(containerRow.classList.contains("slide-in-right")).toBe(true)
      await vi.advanceTimersByTimeAsync(600)
      expect(containerRow.classList.contains("slide-in-right")).toBe(false)
    })

    it("should handle undefined drawerContent flexibly", async () => {
      const containerRow = document.createElement("div")
      service.triggerSlideAnimation(undefined, containerRow, false)
      expect(containerRow.classList.contains("slide-in-right")).toBe(true)
      await vi.advanceTimersByTimeAsync(600)
    })
  })

  describe("triggerSlideOutAnimation", () => {
    it("should add slide-out-right and resolve promise when isBackward is true", async () => {
      const containerRow = document.createElement("div")

      let resolved = false
      service.triggerSlideOutAnimation(containerRow, true).then(() => {
        resolved = true
      })

      expect(containerRow.classList.contains("slide-out-right")).toBe(true)

      // Simulate animation end
      containerRow.dispatchEvent(new Event("animationend"))
      await vi.advanceTimersByTimeAsync(0)

      expect(resolved).toBe(true)
      expect(containerRow.classList.contains("slide-out-right")).toBe(false)
    })

    it("should resolve via fallback timeout if animationend does not fire", async () => {
      const containerRow = document.createElement("div")

      let resolved = false
      service.triggerSlideOutAnimation(containerRow, false).then(() => {
        resolved = true
      })

      expect(containerRow.classList.contains("slide-out-left")).toBe(true)

      // wait for 600ms fallback timeout
      await vi.advanceTimersByTimeAsync(600)

      expect(resolved).toBe(true)
      expect(containerRow.classList.contains("slide-out-left")).toBe(false)
    })
  })

  describe("scrollToVerseElement", () => {
    it("should find verse elements and scroll to them", async () => {
      const bookBlock = document.createElement("div")
      const verse1 = document.createElement("div")
      verse1.id = "1"
      bookBlock.appendChild(verse1)

      const verse2 = document.createElement("div")
      verse2.id = "2"
      bookBlock.appendChild(verse2)

      vi.spyOn(verse1, "scrollIntoView").mockReturnValue(undefined)

      service.scrollToVerseElement(bookBlock, undefined, 1, 1, true, false)
      await vi.advanceTimersByTimeAsync(100)

      expect(verse1.scrollIntoView).toHaveBeenCalled()
      expect(verse1.classList.contains(HIGHLIGHT_CLASS)).toBe(true)
      // The stroke is drawn by the verse component's own styles; painting the
      // inline host from here is what used to colour whitespace and gaps.
      expect(verse1.style.backgroundColor).toBe("")

      await vi.advanceTimersByTimeAsync(HIGHLIGHT_DURATION_MS)
      expect(verse1.classList.contains(HIGHLIGHT_CLASS)).toBe(false)
    })

    it("should scroll to the verse number, not the multi-line inline verse", async () => {
      // WebKit scrolls an inline <verse> that opens a paragraph as if it began
      // at the top of the chapter: Safari opened Jo 3,16 on verses 4-12.
      const bookBlock = document.createElement("div")
      const verse = document.createElement("verse")
      verse.id = "16"
      verse.innerHTML =
        '<span class="verseText verseRun"> </span><span class="verseNumber">16</span><span class="verseRun">Tanto amou Deus o mundo</span>'
      bookBlock.appendChild(verse)
      const verseNumber = verse.querySelector(".verseNumber") as HTMLElement
      vi.spyOn(verse, "scrollIntoView").mockReturnValue(undefined)
      vi.spyOn(verseNumber, "scrollIntoView").mockReturnValue(undefined)

      service.scrollToVerseElement(bookBlock, undefined, 16)
      await vi.advanceTimersByTimeAsync(100)

      expect(verseNumber.scrollIntoView).toHaveBeenCalledWith(
        expect.objectContaining({ block: "center" }),
      )
      expect(verse.scrollIntoView).not.toHaveBeenCalled()
      expect(verse.classList.contains(HIGHLIGHT_CLASS)).toBe(true)

      await vi.advanceTimersByTimeAsync(LAYOUT_SETTLE_MS)
      expect(verseNumber.scrollIntoView).toHaveBeenCalledTimes(2)
      expect(verse.scrollIntoView).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(HIGHLIGHT_DURATION_MS)
    })

    it("should scroll to a verse's first run when it has no number", async () => {
      const bookBlock = document.createElement("div")
      const verse = document.createElement("verse")
      verse.id = "1"
      verse.innerHTML = '<span class="verseRun">No princípio</span>'
      bookBlock.appendChild(verse)
      const run = verse.querySelector(".verseRun") as HTMLElement
      vi.spyOn(verse, "scrollIntoView").mockReturnValue(undefined)
      vi.spyOn(run, "scrollIntoView").mockReturnValue(undefined)

      service.scrollToVerseElement(bookBlock, undefined, 1, 1, false)
      await vi.advanceTimersByTimeAsync(100)

      expect(run.scrollIntoView).toHaveBeenCalled()
      expect(verse.scrollIntoView).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(LAYOUT_SETTLE_MS)
    })

    it("should restart the fade when the same verse is highlighted again", async () => {
      const bookBlock = document.createElement("div")
      const verse1 = document.createElement("div")
      verse1.id = "1"
      bookBlock.appendChild(verse1)
      vi.spyOn(verse1, "scrollIntoView").mockReturnValue(undefined)

      service.scrollToVerseElement(bookBlock, undefined, 1, 1, true, false)
      await vi.advanceTimersByTimeAsync(100)
      await vi.advanceTimersByTimeAsync(HIGHLIGHT_DURATION_MS - 500)

      service.scrollToVerseElement(bookBlock, undefined, 1, 1, true, false)
      await vi.advanceTimersByTimeAsync(100)

      // The first timeout would have fired by now had it not been cleared.
      await vi.advanceTimersByTimeAsync(500)
      expect(verse1.classList.contains(HIGHLIGHT_CLASS)).toBe(true)

      await vi.advanceTimersByTimeAsync(HIGHLIGHT_DURATION_MS)
      expect(verse1.classList.contains(HIGHLIGHT_CLASS)).toBe(false)
    })

    it("should highlight every verse of a range", async () => {
      const bookBlock = document.createElement("div")
      const verses = [1, 2, 3].map((n) => {
        const el = document.createElement("div")
        el.id = String(n)
        bookBlock.appendChild(el)
        vi.spyOn(el, "scrollIntoView").mockReturnValue(undefined)
        return el
      })

      service.scrollToVerseElement(bookBlock, undefined, 1, 3, true, false)
      await vi.advanceTimersByTimeAsync(100)

      expect(verses.every((el) => el.classList.contains(HIGHLIGHT_CLASS))).toBe(
        true,
      )
      // Only the first verse of the range is scrolled into view.
      expect(verses[0].scrollIntoView).toHaveBeenCalled()
      expect(verses[1].scrollIntoView).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(HIGHLIGHT_DURATION_MS)
      expect(verses.some((el) => el.classList.contains(HIGHLIGHT_CLASS))).toBe(
        false,
      )
    })

    it("should do nothing if bookBlock is undefined", async () => {
      expect(() => {
        service.scrollToVerseElement(undefined, undefined, 1, 1, true, false)
      }).not.toThrow()
      await vi.advanceTimersByTimeAsync(100)
    })

    it("should skip if verse element is not found", async () => {
      const bookBlock = document.createElement("div")
      expect(() => {
        service.scrollToVerseElement(bookBlock, undefined, 1, 1, true, false)
      }).not.toThrow()
      await vi.advanceTimersByTimeAsync(100)
    })

    it("should not highlight if highlight is false, but should trigger slide animation on bookContainer", async () => {
      const bookBlock = document.createElement("div")
      const verse1 = document.createElement("div")
      verse1.id = "1"
      bookBlock.appendChild(verse1)
      const bookContainer = document.createElement("div")
      vi.spyOn(verse1, "scrollIntoView").mockReturnValue(undefined)
      vi.spyOn(service, "triggerSlideAnimation").mockReturnValue(undefined)

      service.scrollToVerseElement(
        bookBlock,
        bookContainer,
        1,
        undefined,
        false,
        true,
      )
      await vi.advanceTimersByTimeAsync(100)

      expect(verse1.scrollIntoView).toHaveBeenCalled()
      expect(verse1.classList.contains(HIGHLIGHT_CLASS)).toBe(false)
      expect(service.triggerSlideAnimation).toHaveBeenCalledWith(
        undefined,
        bookContainer,
        true,
      )

      await vi.advanceTimersByTimeAsync(LAYOUT_SETTLE_MS)
    })

    it("should re-align once the layout has settled, so a verse at the end of a chapter is not left short", async () => {
      const bookBlock = document.createElement("div")
      const verse1 = document.createElement("div")
      verse1.id = "1"
      bookBlock.appendChild(verse1)
      const scrollIntoView = vi
        .spyOn(verse1, "scrollIntoView")
        .mockReturnValue(undefined)

      service.scrollToVerseElement(bookBlock, undefined, 1, 1, false, false)
      await vi.advanceTimersByTimeAsync(100)
      // A pending font swap can add a pass of its own, so count the passes that
      // the settle window itself is responsible for rather than the total.
      const afterInitialScroll = vi.mocked(scrollIntoView).mock.calls.length
      expect(afterInitialScroll).toBeGreaterThan(0)

      await vi.advanceTimersByTimeAsync(LAYOUT_SETTLE_MS)
      expect(vi.mocked(scrollIntoView).mock.calls.length).toBeGreaterThan(
        afterInitialScroll,
      )
    })

    it("should stop re-aligning once the reader scrolls for themselves", async () => {
      const bookBlock = document.createElement("div")
      const verse1 = document.createElement("div")
      verse1.id = "1"
      bookBlock.appendChild(verse1)
      const scrollIntoView = vi
        .spyOn(verse1, "scrollIntoView")
        .mockReturnValue(undefined)

      service.scrollToVerseElement(bookBlock, undefined, 1, 1, false, false)
      await vi.advanceTimersByTimeAsync(100)
      window.dispatchEvent(new Event("wheel"))
      const afterTakeOver = vi.mocked(scrollIntoView).mock.calls.length

      await vi.advanceTimersByTimeAsync(LAYOUT_SETTLE_MS)
      expect(vi.mocked(scrollIntoView).mock.calls.length).toBe(afterTakeOver)
    })

    // The pass holds the previous chapter's verse element and scroll strategy;
    // once the reader has moved on it must not scroll the page that replaced it.
    it("should not realign after the pending pass is cancelled", async () => {
      const bookBlock = document.createElement("div")
      const verse1 = document.createElement("div")
      verse1.id = "1"
      bookBlock.appendChild(verse1)
      const bringIntoView = vi.fn().mockName("bringIntoView")

      service.scrollToVerseElement(
        bookBlock,
        undefined,
        1,
        1,
        false,
        false,
        bringIntoView,
      )
      await vi.advanceTimersByTimeAsync(100)
      const afterInitialScroll = vi.mocked(bringIntoView).mock.calls.length

      service.cancelPendingRealign()
      await vi.advanceTimersByTimeAsync(LAYOUT_SETTLE_MS)

      expect(vi.mocked(bringIntoView).mock.calls.length).toBe(
        afterInitialScroll,
      )
    })

    it("should drop a scroll that has not fired yet when cancelled", async () => {
      const bookBlock = document.createElement("div")
      const verse1 = document.createElement("div")
      verse1.id = "1"
      bookBlock.appendChild(verse1)
      const bringIntoView = vi.fn().mockName("bringIntoView")

      service.scrollToVerseElement(
        bookBlock,
        undefined,
        1,
        1,
        false,
        false,
        bringIntoView,
      )
      // Cancelled inside the 100ms window, before the scroll is even attempted.
      service.cancelPendingRealign()
      await vi.advanceTimersByTimeAsync(100 + LAYOUT_SETTLE_MS)

      expect(bringIntoView).not.toHaveBeenCalled()
    })

    it("should supersede an earlier pass when a new verse is scrolled to", async () => {
      const bookBlock = document.createElement("div")
      const verses = [1, 2].map((n) => {
        const el = document.createElement("div")
        el.id = String(n)
        bookBlock.appendChild(el)
        return el
      })
      const first = vi.fn().mockName("first")
      const second = vi.fn().mockName("second")

      service.scrollToVerseElement(
        bookBlock,
        undefined,
        1,
        1,
        false,
        false,
        first,
      )
      await vi.advanceTimersByTimeAsync(100)
      const afterFirstScroll = vi.mocked(first).mock.calls.length

      service.scrollToVerseElement(
        bookBlock,
        undefined,
        2,
        2,
        false,
        false,
        second,
      )
      await vi.advanceTimersByTimeAsync(100 + LAYOUT_SETTLE_MS)

      // Only the verse the reader last asked for keeps being realigned.
      expect(vi.mocked(first).mock.calls.length).toBe(afterFirstScroll)
      expect(lastCall(vi.mocked(second))[0]).toBe(verses[1])
    })

    // Two deep links inside the 100ms window: the older timer used to survive,
    // scroll to its own verse first, and then clear the field tracking the
    // newer one, leaving that one uncancellable.
    it("should drop a deep-link scroll that a newer one supersedes", async () => {
      const bookBlock = document.createElement("div")
      const verses = [1, 2].map((n) => {
        const el = document.createElement("div")
        el.id = String(n)
        bookBlock.appendChild(el)
        return el
      })
      const first = vi.fn().mockName("first")
      const second = vi.fn().mockName("second")

      service.scrollToVerseElement(
        bookBlock,
        undefined,
        1,
        1,
        false,
        false,
        first,
      )
      // Still inside the 100ms window.
      await vi.advanceTimersByTimeAsync(50)
      service.scrollToVerseElement(
        bookBlock,
        undefined,
        2,
        2,
        false,
        false,
        second,
      )
      await vi.advanceTimersByTimeAsync(100)

      expect(first).not.toHaveBeenCalled()
      expect(second).toHaveBeenCalledWith(verses[1])

      // And the newer pass is still cancellable.
      service.cancelPendingRealign()
      await vi.advanceTimersByTimeAsync(LAYOUT_SETTLE_MS)
      expect(vi.mocked(second).mock.calls.length).toBe(1)
    })

    describe("with a font swap still pending", () => {
      let resolveFonts: () => void
      let originalFonts: PropertyDescriptor | undefined

      beforeEach(() => {
        originalFonts = Object.getOwnPropertyDescriptor(document, "fonts")
        const ready = new Promise<void>((resolve) => {
          resolveFonts = () => resolve()
        })
        Object.defineProperty(document, "fonts", {
          value: { status: "loading", ready },
          configurable: true,
        })
      })

      afterEach(() => {
        if (originalFonts) {
          Object.defineProperty(document, "fonts", originalFonts)
        } else {
          Reflect.deleteProperty(document, "fonts")
        }
      })

      // The correction happens on the last thing to settle, not on each: two
      // scrolls would re-aim mid-animation for no gain.
      it("should correct the scroll once, after the font swap lands", async () => {
        const bookBlock = document.createElement("div")
        const verse1 = document.createElement("div")
        verse1.id = "1"
        bookBlock.appendChild(verse1)
        const bringIntoView = vi.fn().mockName("bringIntoView")

        service.scrollToVerseElement(
          bookBlock,
          undefined,
          1,
          1,
          false,
          false,
          bringIntoView,
        )
        await vi.advanceTimersByTimeAsync(100)
        expect(vi.mocked(bringIntoView).mock.calls.length).toBe(1) // the initial scroll

        // The settle timer alone is not enough while a font swap is in flight.
        await vi.advanceTimersByTimeAsync(LAYOUT_SETTLE_MS)
        expect(vi.mocked(bringIntoView).mock.calls.length).toBe(1)

        resolveFonts()
        await vi.advanceTimersByTimeAsync(0)
        expect(vi.mocked(bringIntoView).mock.calls.length).toBe(2)

        // Nothing further once both have settled.
        await vi.advanceTimersByTimeAsync(LAYOUT_SETTLE_MS)
        expect(vi.mocked(bringIntoView).mock.calls.length).toBe(2)
      })

      it("should not correct the scroll before the settle timer, even if the fonts land first", async () => {
        const bookBlock = document.createElement("div")
        const verse1 = document.createElement("div")
        verse1.id = "1"
        bookBlock.appendChild(verse1)
        const bringIntoView = vi.fn().mockName("bringIntoView")

        service.scrollToVerseElement(
          bookBlock,
          undefined,
          1,
          1,
          false,
          false,
          bringIntoView,
        )
        await vi.advanceTimersByTimeAsync(100)

        resolveFonts()
        await vi.advanceTimersByTimeAsync(0)
        expect(vi.mocked(bringIntoView).mock.calls.length).toBe(1) // still only the initial one

        await vi.advanceTimersByTimeAsync(LAYOUT_SETTLE_MS)
        expect(vi.mocked(bringIntoView).mock.calls.length).toBe(2)
      })
    })

    it("should hand the scroll to the given strategy instead of scrollIntoView", async () => {
      const bookBlock = document.createElement("div")
      const verse1 = document.createElement("div")
      verse1.id = "1"
      bookBlock.appendChild(verse1)
      vi.spyOn(verse1, "scrollIntoView").mockReturnValue(undefined)
      const bringIntoView = vi.fn().mockName("bringIntoView")

      service.scrollToVerseElement(
        bookBlock,
        undefined,
        1,
        1,
        false,
        false,
        bringIntoView,
      )
      await vi.advanceTimersByTimeAsync(100)

      expect(bringIntoView).toHaveBeenCalledWith(verse1)
      expect(verse1.scrollIntoView).not.toHaveBeenCalled()
      const afterInitialScroll = vi.mocked(bringIntoView).mock.calls.length

      await vi.advanceTimersByTimeAsync(LAYOUT_SETTLE_MS)
      expect(vi.mocked(bringIntoView).mock.calls.length).toBeGreaterThan(
        afterInitialScroll,
      )
      expect(verse1.scrollIntoView).not.toHaveBeenCalled()
    })
  })
})
