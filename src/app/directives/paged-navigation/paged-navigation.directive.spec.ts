import { Component, ElementRef, ViewChild } from "@angular/core"
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
        style="width: 300px; column-gap: 10px; padding-left: 5px; padding-right: 5px;"
      >
        Content
      </div>
    </div>
  `,
  imports: [PagedNavigationDirective],
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
      } as any)

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
      } as any)

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
      } as any)

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
      } as any)

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
