import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  PLATFORM_ID,
  signal,
  ViewChild,
} from "@angular/core"
import { ComponentFixture, TestBed } from "@angular/core/testing"
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
      [viewMode]="viewMode()"
      (nextChapter)="onNextChapter()"
      (prevChapter)="onPrevChapter()"
      (pageStateChange)="onPageStateChange($event)"
    >
      <div
        #block
        [class.paged-view]="viewMode() === 'paged'"
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
  // Signals: a plain field changed after the first check isn't picked up by a
  // zoneless fixture's detectChanges.
  readonly viewMode = signal<"scrolling" | "paged">("paged")

  @ViewChild("container")
  container!: ElementRef<HTMLElement>
  @ViewChild("block")
  block!: ElementRef<HTMLElement>
  @ViewChild(PagedNavigationDirective)
  directive!: PagedNavigationDirective

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
    container.scrollTo = vi.fn().mockName("scrollTo") as any
  })

  it("should create", () => {
    expect(hostComponent.directive).toBeTruthy()
  })

  describe("switching into paged mode", () => {
    it("measures after the class that creates the columns is applied", async () => {
      vi.useFakeTimers()
      // Angular writes the column class on the inner block *after* this
      // directive's ngOnChanges, so a synchronous measurement sees a
      // single-column block, reports "last page" and leaves the reader without
      // a next-page control — the whole introduction stuck on page one.
      hostComponent.viewMode.set("scrolling")
      fixture.detectChanges()
      await vi.advanceTimersByTimeAsync(16)
      // Seed the state the stale measurement would leave behind.
      hostComponent.pageState = { isFirstPage: true, isLastPage: true }

      const block = hostComponent.block.nativeElement
      vi.spyOn(container, "scrollLeft", "get").mockReturnValue(0)
      vi.spyOn(container, "clientWidth", "get").mockReturnValue(400)
      vi.spyOn(container, "scrollWidth", "get").mockImplementation(() =>
        block.classList.contains("paged-view") ? 1200 : 400,
      )

      hostComponent.viewMode.set("paged")
      fixture.detectChanges()
      await vi.advanceTimersByTimeAsync(16)

      expect(hostComponent.pageState).toEqual({
        isFirstPage: true,
        isLastPage: false,
      })
    })
  })

  describe("late-arriving content", () => {
    it("re-emits the page state when the block grows", () => {
      // Content measured while still one page wide reports "last page"; a
      // lazily loaded introduction then leaves the reader with no next
      // control and overflow-x hidden, i.e. stuck on page one.
      hostComponent.pageState = { isFirstPage: true, isLastPage: true }

      vi.spyOn(container, "scrollLeft", "get").mockReturnValue(0)
      vi.spyOn(container, "scrollWidth", "get").mockReturnValue(1200)
      vi.spyOn(container, "clientWidth", "get").mockReturnValue(400)

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
      const scrollLeftSpy = vi
        .spyOn(container, "scrollLeft", "get")
        .mockReturnValue(0)
      vi.spyOn(container, "scrollWidth", "get").mockReturnValue(300)
      vi.spyOn(container, "clientWidth", "get").mockReturnValue(100)

      hostComponent.directive.onScroll()

      expect(hostComponent.pageState).toEqual({
        isFirstPage: true,
        isLastPage: false,
      })

      // Last page
      scrollLeftSpy.mockReturnValue(200)
      hostComponent.directive.onScroll()

      expect(hostComponent.pageState).toEqual({
        isFirstPage: false,
        isLastPage: true,
      })
    })

    it("should do nothing in scrolling mode", () => {
      hostComponent.viewMode.set("scrolling")
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
      hostComponent.viewMode.set("scrolling")
      fixture.detectChanges()

      hostComponent.directive.nextPage()

      expect(container.scrollTo).not.toHaveBeenCalled()
      expect(hostComponent.nextChapterCalled).toBe(false)
    })

    it("should do nothing if container or block is undefined", () => {
      hostComponent.directive.bookBlock = undefined
      hostComponent.directive.nextPage()
      expect(container.scrollTo).not.toHaveBeenCalled()
    })

    it("should scroll to next page if there is more content", () => {
      // Total scrollable: 200. We are at 0.
      vi.spyOn(container, "scrollLeft", "get").mockReturnValue(0)
      vi.spyOn(container, "scrollWidth", "get").mockReturnValue(300)
      vi.spyOn(container, "clientWidth", "get").mockReturnValue(100)

      // Advance width calc: 300 - (5+5) + 10 = 300?? Wait, block clientWidth is 300.
      vi.spyOn(
        hostComponent.block.nativeElement,
        "clientWidth",
        "get",
      ).mockReturnValue(100)
      vi.spyOn(window, "getComputedStyle").mockReturnValue({
        columnGap: "10px",
        paddingLeft: "5px",
        paddingRight: "5px",
      } as unknown as CSSStyleDeclaration)

      // advanceWidth = 100 - (5+5) + 10 = 100
      // current page = 0 / 100 = 0
      // next = (0+1) * 100 = 100

      hostComponent.directive.nextPage()

      expect(container.scrollTo).toHaveBeenCalledWith({
        left: 100,
        behavior: "smooth",
      })
      expect(hostComponent.nextChapterCalled).toBe(false)
    })

    it("should emit nextChapter when on last page", () => {
      vi.spyOn(container, "scrollLeft", "get").mockReturnValue(200)
      vi.spyOn(container, "scrollWidth", "get").mockReturnValue(300)
      vi.spyOn(container, "clientWidth", "get").mockReturnValue(100)

      hostComponent.directive.nextPage()

      expect(container.scrollTo).not.toHaveBeenCalled()
      expect(hostComponent.nextChapterCalled).toBe(true)
    })
  })

  describe("prevPage", () => {
    it("should do nothing in scrolling mode", () => {
      hostComponent.viewMode.set("scrolling")
      fixture.detectChanges()

      hostComponent.directive.prevPage()

      expect(container.scrollTo).not.toHaveBeenCalled()
      expect(hostComponent.prevChapterCalled).toBe(false)
    })

    it("should do nothing if container or block is undefined", () => {
      hostComponent.directive.bookBlock = undefined
      hostComponent.directive.prevPage()
      expect(container.scrollTo).not.toHaveBeenCalled()
    })

    it("should scroll to previous page if not on first page", () => {
      vi.spyOn(container, "scrollLeft", "get").mockReturnValue(100)

      vi.spyOn(
        hostComponent.block.nativeElement,
        "clientWidth",
        "get",
      ).mockReturnValue(100)
      vi.spyOn(window, "getComputedStyle").mockReturnValue({
        columnGap: "10px",
        paddingLeft: "5px",
        paddingRight: "5px",
      } as unknown as CSSStyleDeclaration)

      // advanceWidth = 100. current page = 1. prev = 0

      hostComponent.directive.prevPage()

      expect(container.scrollTo).toHaveBeenCalledWith({
        left: 0,
        behavior: "smooth",
      })
      expect(hostComponent.prevChapterCalled).toBe(false)
    })

    it("should emit prevChapter when on first page", () => {
      vi.spyOn(container, "scrollLeft", "get").mockReturnValue(0)

      hostComponent.directive.prevPage()

      expect(container.scrollTo).not.toHaveBeenCalled()
      expect(hostComponent.prevChapterCalled).toBe(true)
    })
  })

  describe("aligning the last page", () => {
    beforeEach(() => {
      // advanceWidth = 100 - (5+5) + 10 = 100
      vi.spyOn(
        hostComponent.block.nativeElement,
        "clientWidth",
        "get",
      ).mockReturnValue(100)
      vi.spyOn(window, "getComputedStyle").mockReturnValue({
        columnGap: "10px",
        paddingLeft: "5px",
        paddingRight: "5px",
      } as unknown as CSSStyleDeclaration)
      vi.spyOn(container, "clientWidth", "get").mockReturnValue(100)
    })

    it("pads a last page that ends part-way to a whole page", () => {
      vi.spyOn(container, "scrollWidth", "get").mockReturnValue(350)
      hostComponent.directive.ensureAlignedScrollWidth()
      expect(container.children.length).toBe(2)
    })

    // With the margins inside the columns, a tablet's two columns came out
    // 2 px over 4 pages: padded out, that made a fifth, empty page.
    it("adds no page for a pixel or two of rounding", () => {
      vi.spyOn(container, "scrollWidth", "get").mockReturnValue(302)
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
      vi.spyOn(block, "clientWidth", "get").mockReturnValue(100)
      vi.spyOn(window, "getComputedStyle").mockReturnValue({
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

      expect(container.scrollTo).toHaveBeenCalledWith({
        left: 200,
        behavior: "smooth",
      })
    })

    it("goes back to its page when let go without a turn", () => {
      container.scrollLeft = 100
      hostComponent.directive.dragBy(-30)
      hostComponent.directive.cancelDrag()

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

      expect(hostComponent.prevChapterCalled).toBe(true)
      expect(block.style.transform).toBe("")
    })

    // A second tap before the first turn had gone halfway turned to the same page.
    it("turns on from the page a turn under way is heading for", () => {
      container.scrollLeft = 0
      hostComponent.directive.nextPage()
      hostComponent.directive.nextPage()

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

      const observerSpy = vi.spyOn(window, "MutationObserver")
      const serverFixture = TestBed.createComponent(TestHostComponent)

      expect(() => serverFixture.detectChanges()).not.toThrow()
      expect(observerSpy).not.toHaveBeenCalled()
    })
  })

  describe("scrollToPage", () => {
    /** Puts the directive on a 100px page grid, as the nextPage specs do. */
    function stubPageGrid(): void {
      vi.spyOn(container, "scrollWidth", "get").mockReturnValue(500)
      vi.spyOn(container, "clientWidth", "get").mockReturnValue(100)
      vi.spyOn(
        hostComponent.block.nativeElement,
        "clientWidth",
        "get",
      ).mockReturnValue(100)
      vi.spyOn(window, "getComputedStyle").mockReturnValue({
        columnGap: "10px",
        paddingLeft: "5px",
        paddingRight: "5px",
      } as unknown as CSSStyleDeclaration)
    }

    /** An element whose first fragment sits `left` px into the scroller. */
    function elementAt(left: number): HTMLElement {
      const element = document.createElement("span")
      const rect = { left, right: left, top: 0, bottom: 0 } as DOMRect
      vi.spyOn(element, "getClientRects").mockReturnValue([
        rect,
      ] as unknown as DOMRectList)
      return element
    }

    it("should scroll to the start of the page holding the element, not to the element itself", () => {
      stubPageGrid()
      vi.spyOn(container, "scrollLeft", "get").mockReturnValue(0)

      // The verse starts 250px in, which is a third of the way into page 2.
      hostComponent.directive.scrollToPage(elementAt(250))

      expect(container.scrollTo).toHaveBeenCalledWith({
        left: 200,
        behavior: "smooth",
      })
    })

    it("should measure from the content, not the viewport, when already scrolled", () => {
      stubPageGrid()
      vi.spyOn(container, "scrollLeft", "get").mockReturnValue(300)

      // 120px along the viewport with 300 already scrolled away is page 4.
      hostComponent.directive.scrollToPage(elementAt(120))

      expect(container.scrollTo).toHaveBeenCalledWith({
        left: 400,
        behavior: "smooth",
      })
    })

    it("should not scroll past the end of the content", () => {
      stubPageGrid()
      vi.spyOn(container, "scrollLeft", "get").mockReturnValue(0)

      hostComponent.directive.scrollToPage(elementAt(4000))

      expect(container.scrollTo).toHaveBeenCalledWith({
        left: 400,
        behavior: "smooth",
      })
    })

    it("should do nothing in scrolling mode", () => {
      hostComponent.viewMode.set("scrolling")
      fixture.detectChanges()

      hostComponent.directive.scrollToPage(elementAt(250))

      expect(container.scrollTo).not.toHaveBeenCalled()
    })
  })

  describe("scrollToEnd", () => {
    it("should ensure aligned scroll width and set scrollLeft to the max scroll", () => {
      // Mock sizes
      vi.spyOn(container, "scrollWidth", "get").mockReturnValue(300)
      vi.spyOn(container, "clientWidth", "get").mockReturnValue(100)

      const scrollLeftSetter = vi.fn().mockName("scrollLeftSetter")
      vi.spyOn(container, "scrollLeft", "set").mockImplementation(
        scrollLeftSetter,
      )

      vi.spyOn(hostComponent.directive, "ensureAlignedScrollWidth")

      hostComponent.directive.scrollToEnd()

      expect(
        hostComponent.directive.ensureAlignedScrollWidth,
      ).toHaveBeenCalled()
      // Max scroll is 300 - 100 = 200
      expect(scrollLeftSetter).toHaveBeenCalledWith(200)
    })
  })

  describe("window resize", () => {
    it("should snap to nearest page after debounce", async () => {
      vi.useFakeTimers()
      vi.spyOn(container, "scrollLeft", "get").mockReturnValue(120) // partway

      vi.spyOn(
        hostComponent.block.nativeElement,
        "clientWidth",
        "get",
      ).mockReturnValue(100)
      vi.spyOn(window, "getComputedStyle").mockReturnValue({
        columnGap: "10px",
        paddingLeft: "5px",
        paddingRight: "5px",
      } as unknown as CSSStyleDeclaration)

      // advance width = 100. pageIndex = round(120/100) = 1. left = 100

      window.dispatchEvent(new Event("resize"))

      expect(container.scrollTo).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(150) // wait for debounce

      expect(container.scrollTo).toHaveBeenCalledWith({
        left: 100,
        behavior: "smooth",
      })
    })

    it("should do nothing if viewMode is not paged", () => {
      hostComponent.viewMode.set("scrolling")
      fixture.detectChanges()

      window.dispatchEvent(new Event("resize"))
      // Not a setTimeout spy: the zoneless scheduler uses setTimeout too.
      expect(
        (
          hostComponent.directive as unknown as {
            resizing: boolean
          }
        ).resizing,
      ).toBe(false)
    })

    it("should do nothing if block or container is undefined when resizing", async () => {
      vi.useFakeTimers()
      hostComponent.directive.bookBlock = undefined
      window.dispatchEvent(new Event("resize"))

      await expect(vi.advanceTimersByTimeAsync(150)).resolves.not.toThrow()
    })
  })

  describe("getAdvanceWidth", () => {
    it("should calculate correctly with fallback values", () => {
      vi.spyOn(
        hostComponent.block.nativeElement,
        "clientWidth",
        "get",
      ).mockReturnValue(200)
      vi.spyOn(window, "getComputedStyle").mockReturnValue({
        columnGap: "", // falsy numeric parsing
        paddingLeft: "invalid",
        paddingRight: "",
      } as unknown as CSSStyleDeclaration)

      // advance = 200 - (0+0) + 0 = 200
      vi.spyOn(container, "scrollLeft", "get").mockReturnValue(0)
      vi.spyOn(container, "scrollWidth", "get").mockReturnValue(300)
      vi.spyOn(container, "clientWidth", "get").mockReturnValue(100)

      hostComponent.directive.nextPage()

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
      style="position: relative; overflow: hidden"
      [style.width.px]="width()"
      [style.height.px]="height()"
      [appPagedNavigation]="block"
      viewMode="paged"
    >
      <div
        #block
        style="columns: 1; column-gap: 0; column-fill: auto; font: 16px/20px monospace"
        [style.height.px]="height()"
      >
        @for (verse of verses; track verse) {
        <span [id]="verse"
          >{{ verse }} {{ verse === LONG_VERSE ? longText : text }}
        </span>
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
  readonly width = signal(200)
  readonly height = signal(100)
  verses = Array.from({ length: 80 }, (_, i) => i + 1)
  text = "Disse-lhe Jesus: em verdade, em verdade te digo."
  // Several pages long at 200x100, as a long verse is on a phone at a large size.
  longText = Array(12).fill(this.text).join(" ")
  @ViewChild("container")
  container!: ElementRef<HTMLElement>
  @ViewChild(PagedNavigationDirective)
  nav!: PagedNavigationDirective
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
    host.width.set(width)
    host.height.set(height)
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

  // Pulled left, the text's columns left the scrollable area with it: the
  // browser clamped the scroll back, a jolt on every move, and letting go on
  // the last page of the last chapter left the page off its place.
  it("stays on the last page when pulled past it", async () => {
    const last = container.scrollWidth - container.clientWidth
    container.scrollLeft = last
    await settle()

    host.nav.dragBy(-60)
    expect(container.scrollLeft).toBe(last)
    host.nav.dragBy(-120)
    expect(container.scrollLeft).toBe(last)

    host.nav.nextPage()
    await settle()
    expect(container.scrollLeft).toBe(last)
    expect(container.scrollLeft % 200).toBe(0)
  })

  // Aligning lifted the spacer holding the scrollable area, and measured it
  // under the drag's transform.
  it("waits for a drag to end before aligning late content", async () => {
    const last = container.scrollWidth - container.clientWidth
    container.scrollLeft = last
    await settle()

    host.nav.dragBy(-120)
    const block = container.firstElementChild as HTMLElement
    block.append(document.createElement("span"))
    await settle()
    expect(container.scrollLeft).toBe(last)

    host.nav.nextPage()
    await settle()
    expect(container.scrollLeft).toBe(last)
    await settle()
    expect((container.scrollWidth - container.clientWidth) % 200).toBe(0)
  })

  // A spacer from before the content grew ends short of it, and holds nothing.
  it("holds the scrollable area when content outgrew the spacer", async () => {
    container.scrollLeft = container.scrollWidth - container.clientWidth
    await settle()
    host.nav.dragBy(-60)
    host.nav.cancelDrag()
    await settle()

    const block = container.firstElementChild as HTMLElement
    block.append(host.longText)
    const last = container.scrollWidth - container.clientWidth
    container.scrollLeft = last
    host.nav.dragBy(-120)

    expect(container.scrollLeft).toBe(last)
  })

  it("keeps the verse the reader was on", async () => {
    container.scrollLeft = 5 * 200
    await settle()
    const first = firstVerseOnScreen()
    expect(first).withContext("a verse starts on page 5").toBeDefined()
    if (!first) return
    expect(Number(first.id)).toBeGreaterThan(1)
  it('keeps the verse the reader was on', async () => {
    container.scrollLeft = 5 * 200;
    await settle();
    const first = firstVerseOnScreen();
    expect(first, 'a verse starts on page 5').toBeDefined();
    if (!first) return;
    expect(Number(first.id)).toBeGreaterThan(1);
    expect(first, "a verse starts on page 5").toBeDefined()
    if (!first) return
    expect(Number(first.id)).toBeGreaterThan(1)

    // Turned sideways: wider and taller pages hold several of the old ones.
    await resizeTo(300, 300)

    expect(
      startsOnScreen(first),
      `verse ${first.id} on screen at 300x300`,
    ).toBe(true)
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
    expect(
      pages.size,
      "the long verse runs over several pages",
    ).toBeGreaterThan(4)
    const middle = [...pages].sort((a, b) => a - b)[Math.floor(pages.size / 2)]
    container.scrollLeft = middle * 200
    await settle()
    expect(
      firstVerseOnScreen(),
      "the long verse fills the page",
    ).toBeUndefined()

    await resizeTo(300, 150)

    expect(startsOnScreen(long), "not back on the verse's first page").toBe(
      false,
    )
    expect(pageWithin(long)).toBeGreaterThan(0)
  })

  it("comes back to the same page when turned back", async () => {
    container.scrollLeft = 5 * 200
    await settle()
    const first = firstVerseOnScreen()
    expect(first, "a verse starts on page 5").toBeDefined()

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
    expect(page, "a page two verses start on").toBeDefined()
    if (page === undefined) return
    const verses = startingOn(page)
    const [above, linked] = [verses[0], verses[verses.length - 1]]

    host.nav.scrollToPage(linked, "instant")
    await settle()
    expect(startsOnScreen(linked)).toBe(true)

    await resizeTo(200, 60)

    expect(
      startsOnScreen(linked),
      `verse ${linked.id} on screen at 200x60`,
    ).toBe(true)
    expect(
      startsOnScreen(above),
      `verse ${above.id}, above it, starts on another page now`,
    ).toBe(false)
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
    expect(pages.length, "pages the long verse fills").toBeGreaterThan(2)

    for (const page of pages) {
      container.scrollLeft = page * 200
      await settle()

      await resizeTo(300, 150)
      await resizeTo(200, 100)

      expect(container.scrollLeft, `page ${page}, after turning and back`).toBe(
        page * 200,
      )
    }
  }, 30000)

  // The page on screen was noted only once the pages had rested, and a
  // resize drops a pending note: turned and rotated at once, the reader was
  // taken back to the page before the turn.
  it("finds the page turned to when the resize comes right after", async () => {
    container.scrollLeft = 5 * 200
    // The scroll event, but not the rest that would note the page.
    await new Promise((resolve) =>
      requestAnimationFrame(() => setTimeout(resolve, 20)),
    )
    const turnedTo = firstVerseOnScreen()
    expect(turnedTo, "a verse starts on page 5").toBeDefined()
    if (!turnedTo) return

    await resizeTo(300, 300)

    expect(
      startsOnScreen(turnedTo),
      `verse ${turnedTo.id} on screen at 300x300`,
    ).toBe(true)
  })

  // A throw in the restore left the resize flag set: the verse on screen
  // was never noted again, and every later resize went back to the old one.
  it("goes on noting the verse on screen after a restore that failed", async () => {
    container.scrollLeft = 5 * 200
    await settle()
    const scrollTo = vi.spyOn(container, "scrollTo").mockImplementation(() => {
      throw new TypeError("unsupported scroll behavior")
    })
    // The throw surfaces as an uncaught error on the window. Take it there, so
    // the runner doesn't report it, and check it happened.
    const globalErrors = vi.fn()
    const onError = (event: ErrorEvent) => {
      event.preventDefault()
      event.stopImmediatePropagation()
      globalErrors(event.error)
    }
    window.addEventListener("error", onError, true)
    try {
      await resizeTo(300, 300)
      expect(globalErrors).toHaveBeenCalled()
    } finally {
      window.removeEventListener("error", onError, true)
    }
    scrollTo.mockRestore()

    container.scrollLeft = 2 * 300
    await settle()
    const read = firstVerseOnScreen()
    expect(read, "a verse starts on page 2").toBeDefined()
    if (!read) return

    await resizeTo(200, 100)

    expect(startsOnScreen(read), `verse ${read.id} on screen at 200x100`).toBe(
      true,
    )
  })
})
