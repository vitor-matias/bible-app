import { type ComponentFixture, TestBed } from "@angular/core/testing"
import { provideRouter } from "@angular/router"
import { of } from "rxjs"
import { BookService } from "../../services/book.service"
import { VerseCardsComponent } from "./verse-cards.component"

describe("VerseCardsComponent", () => {
  let fixture: ComponentFixture<VerseCardsComponent>
  let observers: MockIntersectionObserver[]
  let originalIntersectionObserver: typeof IntersectionObserver

  class MockIntersectionObserver {
    observe = jasmine.createSpy("observe")
    disconnect = jasmine.createSpy("disconnect")

    constructor(
      private callback: IntersectionObserverCallback,
      public options?: IntersectionObserverInit,
    ) {
      observers.push(this)
    }

    /** Reports how much of the watched stop is on screen, from 0 to 1. */
    report(intersectionRatio: number): void {
      this.callback(
        [
          {
            intersectionRatio,
            // As WebKit has it: true for any overlap at all, however far
            // below the threshold. The component must not go by this.
            isIntersecting: intersectionRatio > 0,
          } as IntersectionObserverEntry,
        ],
        this as unknown as IntersectionObserver,
      )
    }
  }

  const john: Book = {
    id: "jhn",
    name: "Evangelho segundo São João",
    shortName: "João",
    abrv: "Jo",
    chapterCount: 21,
  }

  const text = (value: string): TextType => ({
    type: "text",
    text: value,
    normalizedText: value,
  })

  function verse(number: number, ...elements: TextType[]): Verse {
    return {
      bookId: john.id,
      chapterNumber: 3,
      number,
      verseLabel: `${number}`,
      text: elements,
    }
  }

  const chapter: Chapter = {
    bookId: john.id,
    number: 3,
    verses: [
      verse(0, {
        type: "section",
        tag: "s2",
        text: "Diálogo com Nicodemos",
        normalizedText: "",
      }),
      verse(
        1,
        { type: "footnote", text: "Nicodemos era fariseu.", reference: "" },
        text("Havia um homem chamado Nicodemos."),
      ),
      verse(2, text("Veio ter com Jesus de noite.")),
    ],
  }

  function cards(): HTMLElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll("article"))
  }

  beforeEach(() => {
    observers = []
    originalIntersectionObserver = globalThis.IntersectionObserver
    globalThis.IntersectionObserver =
      MockIntersectionObserver as unknown as typeof IntersectionObserver

    TestBed.configureTestingModule({
      providers: [
        // <verse> links cross-references through the router.
        provideRouter([]),
        {
          provide: BookService,
          // The real <verse> renders the cards, and its reference parser
          // subscribes to the book list as soon as it is constructed.
          useValue: { books$: of([john]), getBooks: () => [john] },
        },
      ],
    })
    fixture = TestBed.createComponent(VerseCardsComponent)
    fixture.componentRef.setInput("chapter", chapter)
    fixture.detectChanges()
  })

  afterEach(() => {
    globalThis.IntersectionObserver = originalIntersectionObserver
  })

  it("shows exactly one verse on each card, in chapter order", () => {
    expect(cards().length).toBe(2)
    for (const card of cards()) {
      expect(card.querySelectorAll("verse").length).toBe(1)
    }
    expect(cards()[0].textContent).toContain(
      "Havia um homem chamado Nicodemos.",
    )
    expect(cards()[1].textContent).toContain("Veio ter com Jesus de noite.")
  })

  it("puts nothing on a card but the verse", () => {
    // No section heading, no book reference, no buttons: just the verse number
    // and its words.
    expect(cards()[1].textContent?.trim()).toBe("2Veio ter com Jesus de noite.")
    expect(fixture.nativeElement.textContent).not.toContain(
      "Diálogo com Nicodemos",
    )
    expect(fixture.nativeElement.textContent).not.toContain("João")
    expect(fixture.nativeElement.querySelector("button, a")).toBeNull()
  })

  it("shows no footnote marker and leaves the verse untappable", () => {
    // Verse 1 has a footnote, which in the reader draws a marker after the
    // verse number and makes the text a button that opens the notes sheet.
    const first = cards()[0]

    expect(first.textContent?.trim()).toBe("1Havia um homem chamado Nicodemos.")
    expect(first.querySelector(".footnoteIndicator")).toBeNull()
    expect(first.querySelector("[role=button]")).toBeNull()
  })

  it("gives each verse the id a deep link scrolls to", () => {
    // ?verseStart=2 is resolved by the reader with [id="2"], in every view.
    expect(cards()[1].querySelector("verse")?.getAttribute("id")).toBe("2")
  })

  it("names each card for assistive tech without putting the name on screen", () => {
    expect(cards()[1].getAttribute("aria-label")).toBe("Versículo 2")
  })

  // The reader's scroller supplies "scroll-snap-type: y mandatory"; these are
  // the card's half of the contract.
  it("makes each card a stop the scroller cannot fly past: one swipe, one verse", () => {
    const style = getComputedStyle(cards()[0])

    expect(style.scrollSnapAlign).toBe("start")
    expect(style.scrollSnapStop).toBe("always")
  })

  it("fades each verse with the scroll position rather than with script", () => {
    const style = getComputedStyle(cards()[0])

    // Angular scopes the keyframes name, hence toContain.
    expect(style.animationName).toContain("verse-card-fade")
    expect(style.animationTimeline).toContain("view")
  })

  describe("going back to the previous chapter", () => {
    function startCard(): HTMLElement | null {
      return fixture.nativeElement.querySelector(".start-card")
    }

    function offerPrevious(label: string | undefined): void {
      fixture.componentRef.setInput("previousChapterLabel", label)
      fixture.detectChanges()
    }

    it("opens the chapter on one more stop, naming what comes before", () => {
      offerPrevious("João 2")

      expect(startCard()?.textContent?.trim()).toBe("João 2")
      // Ahead of the first verse, and a stop the scroller cannot fly past.
      expect(startCard()?.nextElementSibling).toBe(cards()[0])
      expect(getComputedStyle(startCard() as HTMLElement).scrollSnapStop).toBe(
        "always",
      )
    })

    it("has no leading stop where nothing precedes, as in chapter 1", () => {
      expect(startCard()).toBeNull()
      expect(observers.length).toBe(0)
    })

    it("asks for the previous chapter when the reader scrolls up onto the stop", () => {
      offerPrevious("João 2")
      const reachedStart = jasmine.createSpy("reachedStart")
      const reachedEnd = jasmine.createSpy("reachedEnd")
      fixture.componentInstance.reachedStart.subscribe(reachedStart)
      fixture.componentInstance.reachedEnd.subscribe(reachedEnd)

      expect(observers[0].observe).toHaveBeenCalledOnceWith(startCard())
      expect(observers[0].options?.threshold).toBe(0.9)

      // The chapter opens resting on a verse; then the reader swipes down.
      observers[0].report(0)
      expect(reachedStart).not.toHaveBeenCalled()
      observers[0].report(1)

      expect(reachedStart).toHaveBeenCalledTimes(1)
      expect(reachedEnd).not.toHaveBeenCalled()
    })

    // Regression: a deep link leaves the view at scroll offset 0 — this stop —
    // for the moment before it jumps to its verse. The observer's first reading
    // landed there, and opening João 3,16 sent the reader to João 2.
    it("does not ask when the stop is already on screen as the watching starts", () => {
      offerPrevious("João 2")
      const reachedStart = jasmine.createSpy("reachedStart")
      fixture.componentInstance.reachedStart.subscribe(reachedStart)

      observers[0].report(1)

      expect(reachedStart).not.toHaveBeenCalled()

      // Once the view has moved to its verse, scrolling back up does ask.
      observers[0].report(0)
      observers[0].report(1)

      expect(reachedStart).toHaveBeenCalledTimes(1)
    })

    it("does not ask for a sliver of the stop peeking in", () => {
      offerPrevious("João 2")
      const reachedStart = jasmine.createSpy("reachedStart")
      fixture.componentInstance.reachedStart.subscribe(reachedStart)

      observers[0].report(0)
      observers[0].report(0.4)

      expect(reachedStart).not.toHaveBeenCalled()
    })

    it("asks again only after the reader has left the stop and come back", () => {
      offerPrevious("João 2")
      const reachedStart = jasmine.createSpy("reachedStart")
      fixture.componentInstance.reachedStart.subscribe(reachedStart)

      observers[0].report(0)
      observers[0].report(1)
      observers[0].report(1)
      expect(reachedStart).toHaveBeenCalledTimes(1)

      // Which is also how a chapter that failed to load is retried.
      observers[0].report(0)
      observers[0].report(1)
      expect(reachedStart).toHaveBeenCalledTimes(2)
    })

    it("stops watching when the reader gets back to chapter 1", () => {
      offerPrevious("João 2")

      offerPrevious(undefined)

      expect(startCard()).toBeNull()
      expect(observers[0].disconnect).toHaveBeenCalled()
    })
  })

  describe("the end of the book", () => {
    function closeBook(label: string | undefined): void {
      fixture.componentRef.setInput("endOfBookLabel", label)
      fixture.detectChanges()
    }

    it("says so under the last verse, and only there", () => {
      closeBook("Fim do Evangelho segundo São João")

      const [first, last] = cards()
      expect(last.querySelector(".end-of-book")?.textContent).toBe(
        "Fim do Evangelho segundo São João",
      )
      // Under the verse, not instead of it.
      expect(last.textContent).toContain("Veio ter com Jesus de noite.")
      expect(first.querySelector(".end-of-book")).toBeNull()
    })

    it("says nothing in any other chapter", () => {
      expect(fixture.nativeElement.querySelector(".end-of-book")).toBeNull()
    })
  })

  describe("moving on to the next chapter", () => {
    function endCard(): HTMLElement | null {
      return fixture.nativeElement.querySelector(".end-card")
    }

    function offerNext(label: string | undefined): void {
      fixture.componentRef.setInput("nextChapterLabel", label)
      fixture.detectChanges()
    }

    it("ends the chapter on one more stop, naming what comes next", () => {
      offerNext("João 4")

      expect(endCard()?.textContent?.trim()).toBe("João 4")
      // After the last verse, and a stop the scroller cannot fly past either.
      expect(endCard()?.previousElementSibling).toBe(cards()[1])
      expect(getComputedStyle(endCard() as HTMLElement).scrollSnapStop).toBe(
        "always",
      )
    })

    it("has no closing stop where nothing follows, as at the end of a book", () => {
      expect(endCard()).toBeNull()
      expect(observers.length).toBe(0)
    })

    it("asks for the next chapter when the reader scrolls onto the stop", () => {
      offerNext("João 4")
      const reached = jasmine.createSpy("reachedEnd")
      fixture.componentInstance.reachedEnd.subscribe(reached)

      expect(observers[0].observe).toHaveBeenCalledOnceWith(endCard())
      expect(observers[0].options?.threshold).toBe(0.9)

      observers[0].report(0)
      observers[0].report(1)

      expect(reached).toHaveBeenCalledTimes(1)
    })

    it("does not ask when the stop leaves the screen again", () => {
      offerNext("João 4")
      const reached = jasmine.createSpy("reachedEnd")
      fixture.componentInstance.reachedEnd.subscribe(reached)

      observers[0].report(1)
      reached.calls.reset()
      observers[0].report(0)

      expect(reached).not.toHaveBeenCalled()
    })

    it("stops watching once the last chapter of the book is reached", () => {
      offerNext("João 4")

      offerNext(undefined)

      expect(endCard()).toBeNull()
      expect(observers[0].disconnect).toHaveBeenCalled()
    })

    it("stops watching when the view is left", () => {
      offerNext("João 4")

      fixture.destroy()

      expect(observers[0].disconnect).toHaveBeenCalled()
    })
  })

  it("deals out the new chapter when the reader moves on", () => {
    fixture.componentRef.setInput("chapter", {
      ...chapter,
      number: 4,
      verses: [{ ...verse(1, text("Quando Jesus soube.")), chapterNumber: 4 }],
    })
    fixture.detectChanges()

    expect(cards().length).toBe(1)
    expect(cards()[0].textContent).toContain("Quando Jesus soube.")
  })
})
