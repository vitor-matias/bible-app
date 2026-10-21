import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  PLATFORM_ID,
  ViewChild,
} from "@angular/core"
import {
  ComponentFixture,
  fakeAsync,
  TestBed,
  tick,
} from "@angular/core/testing"
import {
  PagedNavigationDirective,
  PageState,
} from "./paged-navigation.directive"

@Component({
  template: `
    <div
      #container
      style="width: 100px; overflow-x: scroll;"
      [appPagedNavigation]="block"
      [viewMode]="viewMode"
      (nextChapter)="onNextChapter()"
      (prevChapter)="onPrevChapter()"
      (pageStateChange)="onPageStateChange($event)"
    >
      <div
        #block
        [class.paged-view]="viewMode === 'paged'"
        style="width: 300px; column-gap: 10px; padding-left: 5px; padding-right: 5px;"
      >
        Content
      </div>
    </div>
  `,
  imports: [PagedNavigationDirective],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: true,
})
class TestHostComponent {
  viewMode: "scrolling" | "paged" = "paged"

  @ViewChild("container") container!: ElementRef<HTMLElement>
  @ViewChild("block") block!: ElementRef<HTMLElement>
  @ViewChild(PagedNavigationDirective) directive!: PagedNavigationDirective

  nextChapterCalled = false
  prevChapterCalled = false
  pageState?: PageState

  onNextChapter() {
    this.nextChapterCalled = true
  }

  onPrevChapter() {
    this.prevChapterCalled = true
  }

  onPageStateChange(state: PageState) {
    this.pageState = state
  }
}

describe("PagedNavigationDirective", () => {
  let fixture: ComponentFixture<TestHostComponent>
  let hostComponent: TestHostComponent
  let container: HTMLElement

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TestHostComponent],
    }).compileComponents()

    fixture = TestBed.createComponent(TestHostComponent)
    hostComponent = fixture.componentInstance
    fixture.detectChanges()
    container = hostComponent.container.nativeElement

    // Mock scrollTo
    // biome-ignore lint/suspicious/noExplicitAny: bypassing DOM strict args for spy
    container.scrollTo = jasmine.createSpy("scrollTo") as any
  })

  it("should create", () => {
    expect(hostComponent.directive).toBeTruthy()
  })

  describe("switching into paged mode", () => {
    it("measures after the class that creates the columns is applied", fakeAsync(() => {
      // Angular writes the column class on the inner block *after* this
      // directive's ngOnChanges, so a synchronous measurement sees a
      // single-column block, reports "last page" and leaves the reader without
      // a next-page control — the whole introduction stuck on page one.
      hostComponent.viewMode = "scrolling"
      fixture.detectChanges()
      tick(16)
      // Seed the state the stale measurement would leave behind.
      hostComponent.pageState = { isFirstPage: true, isLastPage: true }

      const block = hostComponent.block.nativeElement
      spyOnProperty(container, "scrollLeft").and.returnValue(0)
      spyOnProperty(container, "clientWidth").and.returnValue(400)
      spyOnProperty(container, "scrollWidth").and.callFake(() =>
        block.classList.contains("paged-view") ? 1200 : 400,
      )

      hostComponent.viewMode = "paged"
      fixture.detectChanges()
      tick(16)

      expect(hostComponent.pageState).toEqual({
        isFirstPage: true,
        isLastPage: false,
      })
    }))
  })

  describe("late-arriving content", () => {
    it("re-emits the page state when the block grows", () => {
      // Content measured while still one page wide reports "last page"; a
      // lazily loaded introduction then leaves the reader with no next
      // control and overflow-x hidden, i.e. stuck on page one.
      hostComponent.pageState = { isFirstPage: true, isLastPage: true }

      spyOnProperty(container, "scrollLeft").and.returnValue(0)
      spyOnProperty(container, "scrollWidth").and.returnValue(1200)
      spyOnProperty(container, "clientWidth").and.returnValue(400)

      // The directive observes the block for content changes.
      // Every layout change (the MutationObserver on late content, a chapter
      // transition) funnels through this call.
      hostComponent.directive.ensureAlignedScrollWidth()

      expect(hostComponent.pageState).toEqual({
        isFirstPage: true,
        isLastPage: false,
      })
    })
  })

  describe("onScroll", () => {
    it("should emit page state", () => {
      // Mock scroll state
      const scrollLeftSpy = spyOnProperty(
        container,
        "scrollLeft",
      ).and.returnValue(0)
      spyOnProperty(container, "scrollWidth").and.returnValue(300)
      spyOnProperty(container, "clientWidth").and.returnValue(100)

      hostComponent.directive.onScroll()

      expect(hostComponent.pageState).toEqual({
        isFirstPage: true,
        isLastPage: false,
      })

      // Last page
      scrollLeftSpy.and.returnValue(200)
      hostComponent.directive.onScroll()

      expect(hostComponent.pageState).toEqual({
        isFirstPage: false,
        isLastPage: true,
      })
    })

    it("should do nothing in scrolling mode", () => {
      hostComponent.viewMode = "scrolling"
      fixture.detectChanges()

      hostComponent.pageState = undefined
      hostComponent.directive.onScroll()

      expect(hostComponent.pageState).toBeUndefined()
    })

    it("should do nothing if container is undefined", () => {
      // Simulate missing container
      Object.defineProperty(hostComponent.directive, "container", {
        get: () => undefined,
      })
      hostComponent.pageState = undefined
      hostComponent.directive.onScroll()
      expect(hostComponent.pageState).toBeUndefined()
    })
  })

  describe("nextPage", () => {
    it("should do nothing in scrolling mode", () => {
      hostComponent.viewMode = "scrolling"
      fixture.detectChanges()

      hostComponent.directive.nextPage()

      expect(container.scrollTo).not.toHaveBeenCalled()
      expect(hostComponent.nextChapterCalled).toBeFalse()
    })

    it("should do nothing if container or block is undefined", () => {
      hostComponent.directive.bookBlock = undefined
      hostComponent.directive.nextPage()
      expect(container.scrollTo).not.toHaveBeenCalled()
    })

    it("should scroll to next page if there is more content", () => {
      // Total scrollable: 200. We are at 0.
      spyOnProperty(container, "scrollLeft").and.returnValue(0)
      spyOnProperty(container, "scrollWidth").and.returnValue(300)
      spyOnProperty(container, "clientWidth").and.returnValue(100)

      // Advance width calc: 300 - (5+5) + 10 = 300?? Wait, block clientWidth is 300.
      spyOnProperty(
        hostComponent.block.nativeElement,
        "clientWidth",
      ).and.returnValue(100)
      spyOn(window, "getComputedStyle").and.returnValue({
        columnGap: "10px",
        paddingLeft: "5px",
        paddingRight: "5px",
      } as unknown as CSSStyleDeclaration)

      // advanceWidth = 100 - (5+5) + 10 = 100
      // current page = 0 / 100 = 0
      // next = (0+1) * 100 = 100

      hostComponent.directive.nextPage()

      // @ts-expect-error TS complains about 1 argument for scrollTo overload
      expect(container.scrollTo).toHaveBeenCalledWith({
        left: 100,
        behavior: "smooth",
      })
      expect(hostComponent.nextChapterCalled).toBeFalse()
    })

    it("should emit nextChapter when on last page", () => {
      spyOnProperty(container, "scrollLeft").and.returnValue(200)
      spyOnProperty(container, "scrollWidth").and.returnValue(300)
      spyOnProperty(container, "clientWidth").and.returnValue(100)

      hostComponent.directive.nextPage()

      expect(container.scrollTo).not.toHaveBeenCalled()
      expect(hostComponent.nextChapterCalled).toBeTrue()
    })
  })

  describe("prevPage", () => {
    it("should do nothing in scrolling mode", () => {
      hostComponent.viewMode = "scrolling"
      fixture.detectChanges()

      hostComponent.directive.prevPage()

      expect(container.scrollTo).not.toHaveBeenCalled()
      expect(hostComponent.prevChapterCalled).toBeFalse()
    })

    it("should do nothing if container or block is undefined", () => {
      hostComponent.directive.bookBlock = undefined
      hostComponent.directive.prevPage()
      expect(container.scrollTo).not.toHaveBeenCalled()
    })

    it("should scroll to previous page if not on first page", () => {
      spyOnProperty(container, "scrollLeft").and.returnValue(100)

      spyOnProperty(
        hostComponent.block.nativeElement,
        "clientWidth",
      ).and.returnValue(100)
      spyOn(window, "getComputedStyle").and.returnValue({
        columnGap: "10px",
        paddingLeft: "5px",
        paddingRight: "5px",
      } as unknown as CSSStyleDeclaration)

      // advanceWidth = 100. current page = 1. prev = 0

      hostComponent.directive.prevPage()

      // @ts-expect-error TS complains about 1 argument for scrollTo overload
      expect(container.scrollTo).toHaveBeenCalledWith({
        left: 0,
        behavior: "smooth",
      })
      expect(hostComponent.prevChapterCalled).toBeFalse()
    })

    it("should emit prevChapter when on first page", () => {
      spyOnProperty(container, "scrollLeft").and.returnValue(0)

      hostComponent.directive.prevPage()

      expect(container.scrollTo).not.toHaveBeenCalled()
      expect(hostComponent.prevChapterCalled).toBeTrue()
    })
  })

  describe("aligning the last page", () => {
    beforeEach(() => {
      // advanceWidth = 100 - (5+5) + 10 = 100
      spyOnProperty(
        hostComponent.block.nativeElement,
        "clientWidth",
      ).and.returnValue(100)
      spyOn(window, "getComputedStyle").and.returnValue({
        columnGap: "10px",
        paddingLeft: "5px",
        paddingRight: "5px",
      } as unknown as CSSStyleDeclaration)
      spyOnProperty(container, "clientWidth").and.returnValue(100)
    })

    it("pads a last page that ends part-way to a whole page", () => {
      spyOnProperty(container, "scrollWidth").and.returnValue(350)
      hostComponent.directive.ensureAlignedScrollWidth()
      expect(container.children.length).toBe(2)
    })

    // With the margins inside the columns, a tablet's two columns came out
    // 2 px over 4 pages: padded out, that made a fifth, empty page.
    it("adds no page for a pixel or two of rounding", () => {
      spyOnProperty(container, "scrollWidth").and.returnValue(302)
      hostComponent.directive.ensureAlignedScrollWidth()
      expect(container.children.length).toBe(1)
    })
  })

  // The page stood still under the finger and turned only once it let go.
  describe("dragging a page", () => {
    let block: HTMLElement
    const shift = () =>
      Number(/translateX\((-?[\d.]+)px\)/.exec(block.style.transform)?.[1])

    beforeEach(() => {
      block = hostComponent.block.nativeElement
      // advanceWidth = 100 - (5+5) + 10 = 100; the content scrolls 200.
      spyOnProperty(block, "clientWidth").and.returnValue(100)
      spyOn(window, "getComputedStyle").and.returnValue({
        columnGap: "10px",
        paddingLeft: "5px",
        paddingRight: "5px",
      } as unknown as CSSStyleDeclaration)
    })

    it("moves the page with the finger", () => {
      container.scrollLeft = 100
      hostComponent.directive.dragBy(-30)
      expect(container.scrollLeft).toBe(130)
    })

    it("turns from the page the drag started on", () => {
      container.scrollLeft = 100
      hostComponent.directive.dragBy(-70)
      hostComponent.directive.nextPage()

      // @ts-expect-error TS complains about 1 argument for scrollTo overload
      expect(container.scrollTo).toHaveBeenCalledWith({
        left: 200,
        behavior: "smooth",
      })
    })

    it("goes back to its page when let go without a turn", () => {
      container.scrollLeft = 100
      hostComponent.directive.dragBy(-30)
      hostComponent.directive.cancelDrag()

      // @ts-expect-error TS complains about 1 argument for scrollTo overload
      expect(container.scrollTo).toHaveBeenCalledWith({
        left: 100,
        behavior: "smooth",
      })
    })

    it("gives past the first page, less the further it is pulled", () => {
      container.scrollLeft = 0
      hostComponent.directive.dragBy(60)
      const first = shift()
      hostComponent.directive.dragBy(120)
      const second = shift()

      expect(container.scrollLeft).toBe(0)
      expect(first).toBeGreaterThan(0)
      expect(first).toBeLessThan(60)
      expect(second - first).toBeLessThan(first)
    })

    it("springs back as it turns to the previous chapter", () => {
      container.scrollLeft = 0
      hostComponent.directive.dragBy(60)
      hostComponent.directive.prevPage()

      expect(hostComponent.prevChapterCalled).toBeTrue()
      expect(block.style.transform).toBe("")
    })

    // A second tap before the first turn had gone halfway turned to the same page.
    it("turns on from the page a turn under way is heading for", () => {
      container.scrollLeft = 0
      hostComponent.directive.nextPage()
      hostComponent.directive.nextPage()

      // @ts-expect-error TS complains about 1 argument for scrollTo overload
      expect(container.scrollTo).toHaveBeenCalledWith({
        left: 200,
        behavior: "smooth",
      })
    })
  })

  // The bookBlock setter observes content changes as soon as it is bound, and
  // the server DOM has no MutationObserver — binding it there used to throw
  // once per prerendered route.
  describe("server rendering", () => {
    it("should not observe content changes and should render without throwing", async () => {
      TestBed.resetTestingModule()
      await TestBed.configureTestingModule({
        imports: [TestHostComponent],
        providers: [{ provide: PLATFORM_ID, useValue: "server" }],
      }).compileComponents()

      const observerSpy = spyOn(window, "MutationObserver").and.callThrough()
      const serverFixture = TestBed.createComponent(TestHostComponent)

      expect(() => serverFixture.detectChanges()).not.toThrow()
      expect(observerSpy).not.toHaveBeenCalled()
    })
  })

  describe("scrollToPage", () => {
    /** Puts the directive on a 100px page grid, as the nextPage specs do. */
    function stubPageGrid(): void {
      spyOnProperty(container, "scrollWidth").and.returnValue(500)
      spyOnProperty(container, "clientWidth").and.returnValue(100)
      spyOnProperty(
        hostComponent.block.nativeElement,
        "clientWidth",
      ).and.returnValue(100)
      spyOn(window, "getComputedStyle").and.returnValue({
        columnGap: "10px",
        paddingLeft: "5px",
        paddingRight: "5px",
      } as unknown as CSSStyleDeclaration)
    }

    /** An element whose first fragment sits `left` px into the scroller. */
    function elementAt(left: number): HTMLElement {
      const element = document.createElement("span")
      const rect = { left, right: left, top: 0, bottom: 0 } as DOMRect
      spyOn(element, "getClientRects").and.returnValue([
        rect,
      ] as unknown as DOMRectList)
      return element
    }

    it("should scroll to the start of the page holding the element, not to the element itself", () => {
      stubPageGrid()
      spyOnProperty(container, "scrollLeft").and.returnValue(0)

      // The verse starts 250px in, which is a third of the way into page 2.
      hostComponent.directive.scrollToPage(elementAt(250))

      // @ts-expect-error TS complains about 1 argument for scrollTo overload
      expect(container.scrollTo).toHaveBeenCalledWith({
        left: 200,
        behavior: "smooth",
      })
    })

    it("should measure from the content, not the viewport, when already scrolled", () => {
      stubPageGrid()
      spyOnProperty(container, "scrollLeft").and.returnValue(300)

      // 120px along the viewport with 300 already scrolled away is page 4.
      hostComponent.directive.scrollToPage(elementAt(120))

      // @ts-expect-error TS complains about 1 argument for scrollTo overload
      expect(container.scrollTo).toHaveBeenCalledWith({
        left: 400,
        behavior: "smooth",
      })
    })

    it("should not scroll past the end of the content", () => {
      stubPageGrid()
      spyOnProperty(container, "scrollLeft").and.returnValue(0)

      hostComponent.directive.scrollToPage(elementAt(4000))

      // @ts-expect-error TS complains about 1 argument for scrollTo overload
      expect(container.scrollTo).toHaveBeenCalledWith({
        left: 400,
        behavior: "smooth",
      })
    })

    it("should do nothing in scrolling mode", () => {
      hostComponent.viewMode = "scrolling"
      fixture.detectChanges()

      hostComponent.directive.scrollToPage(elementAt(250))

      expect(container.scrollTo).not.toHaveBeenCalled()
    })
  })

  describe("scrollToEnd", () => {
    it("should ensure aligned scroll width and set scrollLeft to the max scroll", () => {
      // Mock sizes
      spyOnProperty(container, "scrollWidth").and.returnValue(300)
      spyOnProperty(container, "clientWidth").and.returnValue(100)

      const scrollLeftSetter = jasmine.createSpy("scrollLeftSetter")
      spyOnProperty(container, "scrollLeft", "set").and.callFake(
        scrollLeftSetter,
      )

      spyOn(
        hostComponent.directive,
        "ensureAlignedScrollWidth",
      ).and.callThrough()

      hostComponent.directive.scrollToEnd()

      expect(
        hostComponent.directive.ensureAlignedScrollWidth,
      ).toHaveBeenCalled()
      // Max scroll is 300 - 100 = 200
      expect(scrollLeftSetter).toHaveBeenCalledWith(200)
    })
  })

  describe("window resize", () => {
    it("should snap to nearest page after debounce", fakeAsync(() => {
      spyOnProperty(container, "scrollLeft").and.returnValue(120) // partway

      spyOnProperty(
        hostComponent.block.nativeElement,
        "clientWidth",
      ).and.returnValue(100)
      spyOn(window, "getComputedStyle").and.returnValue({
        columnGap: "10px",
        paddingLeft: "5px",
        paddingRight: "5px",
      } as unknown as CSSStyleDeclaration)

      // advance width = 100. pageIndex = round(120/100) = 1. left = 100

      window.dispatchEvent(new Event("resize"))

      expect(container.scrollTo).not.toHaveBeenCalled()

      tick(150) // wait for debounce

      // @ts-expect-error TS complains about 1 argument for scrollTo overload
      expect(container.scrollTo).toHaveBeenCalledWith({
        left: 100,
        behavior: "smooth",
      })
    }))

    it("should do nothing if viewMode is not paged", () => {
      let timeoutCalled = false
      spyOn(window, "setTimeout").and.callFake((() => {
        timeoutCalled = true
        return 1
      }) as unknown as typeof setTimeout)
      hostComponent.viewMode = "scrolling"
      fixture.detectChanges()

      window.dispatchEvent(new Event("resize"))
      expect(timeoutCalled).toBeFalse()
    })

    it("should do nothing if block or container is undefined when resizing", fakeAsync(() => {
      hostComponent.directive.bookBlock = undefined
      window.dispatchEvent(new Event("resize"))

      expect(() => {
        tick(150)
      }).not.toThrow()
    }))
  })

  describe("getAdvanceWidth", () => {
    it("should calculate correctly with fallback values", () => {
      spyOnProperty(
        hostComponent.block.nativeElement,
        "clientWidth",
      ).and.returnValue(200)
      spyOn(window, "getComputedStyle").and.returnValue({
        columnGap: "", // falsy numeric parsing
        paddingLeft: "invalid",
        paddingRight: "",
      } as unknown as CSSStyleDeclaration)

      // advance = 200 - (0+0) + 0 = 200
      spyOnProperty(container, "scrollLeft").and.returnValue(0)
      spyOnProperty(container, "scrollWidth").and.returnValue(300)
      spyOnProperty(container, "clientWidth").and.returnValue(100)

      hostComponent.directive.nextPage()

      // @ts-expect-error TS complains about 1 argument for scrollTo overload
      expect(container.scrollTo).toHaveBeenCalledWith({
        left: 200, // advanceWidth used
        behavior: "smooth",
      })
    })
  })
})

@Component({
  template: `
    <div
      #container
      style="overflow: hidden"
      [style.width.px]="width"
      [style.height.px]="height"
      [appPagedNavigation]="block"
      viewMode="paged"
    >
      <div
        #block
        style="columns: 1; column-gap: 0; column-fill: auto; font: 16px/20px monospace"
        [style.height.px]="height"
      >
        @for (verse of verses; track verse) {
          <span [id]="verse">{{ verse }} {{ verse === LONG_VERSE ? longText : text }} </span>
        }
      </div>
    </div>
  `,
  imports: [PagedNavigationDirective],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: true,
})
class PagesHostComponent {
  readonly LONG_VERSE = LONG_VERSE
  width = 200
  height = 100
  verses = Array.from({ length: 80 }, (_, i) => i + 1)
  text = "Disse-lhe Jesus: em verdade, em verdade te digo."
  // Several pages long at 200x100, as a long verse is on a phone at a large size.
  longText = Array(12).fill(this.text).join(" ")
  @ViewChild("container") container!: ElementRef<HTMLElement>
  @ViewChild(PagedNavigationDirective) nav!: PagedNavigationDirective
}

const LONG_VERSE = 30

// A rotation, a folding phone or Split View lays the pages out anew. The page
// was found again by its pixel offset, which held other verses: Jo 3 from
// verse 11 opened on verse 27 when the iPhone Duo unfolded.
describe("PagedNavigationDirective across a resize", () => {
  let fixture: ComponentFixture<PagesHostComponent>
  let host: PagesHostComponent
  let container: HTMLElement

  const settle = () => new Promise((resolve) => setTimeout(resolve, 400))

  const verse = (id: number) =>
    container.querySelector(`[id="${id}"]`) as HTMLElement
  const fragments = (element: HTMLElement) =>
    Array.from(element.getClientRects())
  const onScreen = (rect: DOMRect) => {
    const box = container.getBoundingClientRect()
    return rect.left >= box.left - 1 && rect.left < box.right - 1
  }

  function startsOnScreen(element: HTMLElement): boolean {
    const start = fragments(element)[0]
    return start !== undefined && onScreen(start)
  }

  /** The first verse that starts on the page on screen. */
  const firstVerseOnScreen = () =>
    Array.from(container.querySelectorAll<HTMLElement>("[id]")).find(
      startsOnScreen,
    )

  /** Which of the pages a verse runs over is on screen, from 0. */
  function pageWithin(element: HTMLElement): number {
    const box = container.getBoundingClientRect()
    const pages = new Set(
      fragments(element).map((rect) =>
        Math.floor(
          (rect.left - box.left + container.scrollLeft + 1) / box.width,
        ),
      ),
    )
    const shown = Math.floor(container.scrollLeft / box.width)
    return [...pages].sort((a, b) => a - b).indexOf(shown)
  }

  /** The page an element starts on, from 0. */
  function startPage(element: HTMLElement): number {
    const box = container.getBoundingClientRect()
    const start = fragments(element)[0]
    return Math.floor(
      (start.left - box.left + container.scrollLeft + 1) / box.width,
    )
  }

  /** The verses that start on a page, in order. */
  const startingOn = (page: number) =>
    Array.from(container.querySelectorAll<HTMLElement>("[id]")).filter(
      (element) => startPage(element) === page,
    )

  async function resizeTo(width: number, height: number): Promise<void> {
    host.width = width
    host.height = height
    fixture.detectChanges()
    window.dispatchEvent(new Event("resize"))
    await settle()
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PagesHostComponent],
    }).compileComponents()
    fixture = TestBed.createComponent(PagesHostComponent)
    host = fixture.componentInstance
    fixture.detectChanges()
    container = host.container.nativeElement
    await settle()
  })

  it("keeps the verse the reader was on", async () => {
    container.scrollLeft = 5 * 200
    await settle()
    const first = firstVerseOnScreen()
    expect(first).withContext("a verse starts on page 5").toBeDefined()
    if (!first) return
    expect(Number(first.id)).toBeGreaterThan(1)

    // Turned sideways: wider and taller pages hold several of the old ones.
    await resizeTo(300, 300)

    expect(startsOnScreen(first))
      .withContext(`verse ${first.id} on screen at 300x300`)
      .toBeTrue()
    expect(container.scrollLeft % 300).toBe(0)
  })

  // A page that one verse fills was found again by where the verse starts:
  // the reader went back to its first page.
  it("keeps the place inside a verse longer than a page", async () => {
    const long = verse(LONG_VERSE)
    const pages = new Set(
      fragments(long).map((rect) =>
        Math.floor((rect.left - container.getBoundingClientRect().left) / 200),
      ),
    )
    expect(pages.size)
      .withContext("the long verse runs over several pages")
      .toBeGreaterThan(4)
    const middle = [...pages].sort((a, b) => a - b)[Math.floor(pages.size / 2)]
    container.scrollLeft = middle * 200
    await settle()
    expect(firstVerseOnScreen())
      .withContext("the long verse fills the page")
      .toBeUndefined()

    await resizeTo(300, 150)

    expect(startsOnScreen(long))
      .withContext("not back on the verse's first page")
      .toBeFalse()
    expect(pageWithin(long)).toBeGreaterThan(0)
  })

  it("comes back to the same page when turned back", async () => {
    container.scrollLeft = 5 * 200
    await settle()
    const first = firstVerseOnScreen()
    expect(first).withContext("a verse starts on page 5").toBeDefined()

    await resizeTo(300, 300)
    await resizeTo(200, 100)
    await resizeTo(300, 300)
    await resizeTo(200, 100)

    expect(container.scrollLeft).toBe(5 * 200)
    expect(firstVerseOnScreen()).toBe(first)
  })

  // A deep link opened on its verse's page, lower down it. The first verse
  // starting on the page was noted instead, and smaller pages left the linked
  // verse on the page after it.
  it("keeps the verse a link opened on", async () => {
    const page = [3, 4, 5, 6, 7, 8].find((p) => startingOn(p).length > 1)
    expect(page).withContext("a page two verses start on").toBeDefined()
    if (page === undefined) return
    const verses = startingOn(page)
    const [above, linked] = [verses[0], verses[verses.length - 1]]

    host.nav.scrollToPage(linked, "instant")
    await settle()
    expect(startsOnScreen(linked)).toBeTrue()

    await resizeTo(200, 60)

    expect(startsOnScreen(linked))
      .withContext(`verse ${linked.id} on screen at 200x60`)
      .toBeTrue()
    expect(startsOnScreen(above))
      .withContext(`verse ${above.id}, above it, starts on another page now`)
      .toBeFalse()
  })

  // Rounding the page's start into the other layout landed a page on, and on
  // the long verse's last page the next verse took over: each rotation and
  // back walked the reader through the verse.
  it("comes back to the same page inside a verse longer than a page", async () => {
    const long = verse(LONG_VERSE)
    const first = startPage(long)
    const inside = new Set(
      fragments(long).map((rect) =>
        Math.floor((rect.left - container.getBoundingClientRect().left) / 200),
      ),
    )
    // Not the first page, nor the last, where the next verse starts.
    const pages = [...inside].filter(
      (page) => page > first && startingOn(page).length === 0,
    )
    expect(pages.length)
      .withContext("pages the long verse fills")
      .toBeGreaterThan(2)

    for (const page of pages) {
      container.scrollLeft = page * 200
      await settle()

      await resizeTo(300, 150)
      await resizeTo(200, 100)

      expect(container.scrollLeft)
        .withContext(`page ${page}, after turning and back`)
        .toBe(page * 200)
    }
  }, 30_000)

  // A throw in the restore left the resize flag set: the verse on screen
  // was never noted again, and every later resize went back to the old one.
  it("goes on noting the verse on screen after a restore that failed", async () => {
    container.scrollLeft = 5 * 200
    await settle()
    const scrollTo = spyOn(container, "scrollTo").and.throwError(
      new TypeError("unsupported scroll behavior"),
    )
    await jasmine.spyOnGlobalErrorsAsync(async (globalErrors) => {
      await resizeTo(300, 300)
      expect(globalErrors).toHaveBeenCalled()
    })
    scrollTo.and.callThrough()

    container.scrollLeft = 2 * 300
    await settle()
    const read = firstVerseOnScreen()
    expect(read).withContext("a verse starts on page 2").toBeDefined()
    if (!read) return

    await resizeTo(200, 100)

    expect(startsOnScreen(read))
      .withContext(`verse ${read.id} on screen at 200x100`)
      .toBeTrue()
  })
})
