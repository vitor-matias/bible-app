import { fakeAsync, TestBed, tick } from "@angular/core/testing"
import { BibleReaderAnimationService } from "./bible-reader-animation.service"

describe("BibleReaderAnimationService", () => {
  let service: BibleReaderAnimationService

  beforeEach(() => {
    TestBed.configureTestingModule({})
    service = TestBed.inject(BibleReaderAnimationService)
  })

  it("should be created", () => {
    expect(service).toBeTruthy()
  })

  // Helper to mock requestAnimationFrame
  beforeEach(() => {
    spyOn(window, "requestAnimationFrame").and.callFake(
      (cb: FrameRequestCallback) => {
        cb(0)
        return 0
      },
    )
  })

  describe("scrollToTop", () => {
    it("should scroll to top in scrolling viewMode", fakeAsync(() => {
      const drawerContentRow = document.createElement("div")
      const containerRow = document.createElement("div")
      spyOn(drawerContentRow, "scrollTo")
      spyOn(service, "triggerSlideAnimation")

      service.scrollToTop(drawerContentRow, containerRow, "scrolling", false)

      tick(0)
      // @ts-expect-error TS complains about 1 argument for scrollTo overload
      expect(drawerContentRow.scrollTo).toHaveBeenCalledWith({
        top: 0,
        behavior: "smooth",
      })

      // We have another setTimeout inside for requestAnimationFrame which we can't easily mock tick
      // However we know it gets called. The best we can do is expect the first part.
    }))

    it("should handle undefined elements without throwing", fakeAsync(() => {
      expect(() => {
        service.scrollToTop(undefined, undefined, "scrolling", false)
        tick(0)
      }).not.toThrow()
    }))

    it("should scroll to start in paged viewMode and startAtBottom false", fakeAsync(() => {
      const drawerContentRow = document.createElement("div")
      const containerRow = document.createElement("div")
      spyOn(service, "triggerSlideAnimation")

      service.scrollToTop(drawerContentRow, containerRow, "paged", false)

      tick(0)
      // inner setTimeout
      tick(0)

      expect(containerRow.scrollLeft).toBe(0)
      expect(service.triggerSlideAnimation).toHaveBeenCalledWith(
        drawerContentRow,
        containerRow,
        false,
      )
    }))

    it("should scroll to end in paged viewMode and startAtBottom true", fakeAsync(() => {
      const drawerContentRow = document.createElement("div")
      const containerRow = document.createElement("div")
      Object.defineProperty(containerRow, "scrollWidth", { value: 500 })
      Object.defineProperty(containerRow, "clientWidth", { value: 100 })
      let sl = 0
      Object.defineProperty(containerRow, "scrollLeft", {
        get: () => sl,
        set: (v) => { sl = v }
      })
      spyOn(service, "triggerSlideAnimation")

      service.scrollToTop(drawerContentRow, containerRow, "paged", true)

      tick(0)
      // inner setTimeout of 100ms
      tick(100)

      expect(containerRow.scrollLeft).toBe(400)
      expect(service.triggerSlideAnimation).toHaveBeenCalledWith(
        drawerContentRow,
        containerRow,
        true,
      )
    }))

    it("should scroll to 0 if maxScroll is negative in paged viewMode startAtBottom true", fakeAsync(() => {
      const drawerContentRow = document.createElement("div")
      const containerRow = document.createElement("div")
      Object.defineProperty(containerRow, "scrollWidth", { value: 100 })
      Object.defineProperty(containerRow, "clientWidth", { value: 500 })
      spyOn(service, "triggerSlideAnimation")

      service.scrollToTop(drawerContentRow, containerRow, "paged", true)

      tick(0)
      tick(100)

      expect(containerRow.scrollLeft).toBe(0)
    }))
  })

  describe("triggerSlideAnimation", () => {
    it("should add slide-in-left class when isBackward is true", fakeAsync(() => {
      const drawerContentRow = document.createElement("div")
      const containerRow = document.createElement("div")

      service.triggerSlideAnimation(drawerContentRow, containerRow, true)

      expect(containerRow.classList.contains("slide-in-left")).toBeTrue()
      tick(600)
      expect(containerRow.classList.contains("slide-in-left")).toBeFalse()
    }))

    it("should add slide-in-right class when isBackward is false", fakeAsync(() => {
      const drawerContentRow = document.createElement("div")
      const containerRow = document.createElement("div")

      service.triggerSlideAnimation(drawerContentRow, containerRow, false)

      expect(containerRow.classList.contains("slide-in-right")).toBeTrue()
      tick(600)
      expect(containerRow.classList.contains("slide-in-right")).toBeFalse()
    }))

    it("should handle undefined drawerContent flexibly", fakeAsync(() => {
      const containerRow = document.createElement("div")
      service.triggerSlideAnimation(undefined, containerRow, false)
      expect(containerRow.classList.contains("slide-in-right")).toBeTrue()
      tick(600)
    }))
  })

  describe("triggerSlideOutAnimation", () => {
    it("should add slide-out-right and resolve promise when isBackward is true", fakeAsync(() => {
      const containerRow = document.createElement("div")

      let resolved = false
      service.triggerSlideOutAnimation(containerRow, true).then(() => {
        resolved = true
      })

      expect(containerRow.classList.contains("slide-out-right")).toBeTrue()

      // Simulate animation end
      containerRow.dispatchEvent(new Event("animationend"))
      tick()

      expect(resolved).toBeTrue()
      expect(containerRow.classList.contains("slide-out-right")).toBeFalse()
    }))

    it("should resolve via fallback timeout if animationend does not fire", fakeAsync(() => {
      const containerRow = document.createElement("div")

      let resolved = false
      service.triggerSlideOutAnimation(containerRow, false).then(() => {
        resolved = true
      })

      expect(containerRow.classList.contains("slide-out-left")).toBeTrue()

      // wait for 600ms fallback timeout
      tick(600)

      expect(resolved).toBeTrue()
      expect(containerRow.classList.contains("slide-out-left")).toBeFalse()
    }))
  })

  describe("scrollToVerseElement", () => {
    it("should find verse elements and scroll to them", fakeAsync(() => {
      const bookBlock = document.createElement("div")
      const verse1 = document.createElement("div")
      verse1.id = "1"
      bookBlock.appendChild(verse1)

      const verse2 = document.createElement("div")
      verse2.id = "2"
      bookBlock.appendChild(verse2)

      spyOn(verse1, "scrollIntoView")

      service.scrollToVerseElement(bookBlock, undefined, 1, 1, true, false)
      tick(100)

      expect(verse1.scrollIntoView).toHaveBeenCalled()
      expect(verse1.style.backgroundColor).toBe("var(--highlight-color)")

      tick(2500)
      expect(verse1.style.backgroundColor).toBe("")
    }))

    it("should do nothing if bookBlock is undefined", fakeAsync(() => {
      expect(() => {
        service.scrollToVerseElement(undefined, undefined, 1, 1, true, false)
        tick(100)
      }).not.toThrow()
    }))

    it("should skip if verse element is not found", fakeAsync(() => {
      const bookBlock = document.createElement("div")
      expect(() => {
        service.scrollToVerseElement(bookBlock, undefined, 1, 1, true, false)
        tick(100)
      }).not.toThrow()
    }))

    it("should not highlight if highlight is false, but should trigger slide animation on bookContainer", fakeAsync(() => {
      const bookBlock = document.createElement("div")
      const verse1 = document.createElement("div")
      verse1.id = "1"
      bookBlock.appendChild(verse1)
      const bookContainer = document.createElement("div")
      spyOn(verse1, "scrollIntoView")
      spyOn(service, "triggerSlideAnimation")

      service.scrollToVerseElement(
        bookBlock,
        bookContainer,
        1,
        undefined,
        false,
        true,
      )
      tick(100)

      expect(verse1.scrollIntoView).toHaveBeenCalled()
      expect(verse1.style.backgroundColor).not.toBe("var(--highlight-color)")
      expect(service.triggerSlideAnimation).toHaveBeenCalledWith(
        undefined,
        bookContainer,
        true,
      )
    }))
  })
})
