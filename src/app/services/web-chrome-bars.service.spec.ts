import { TestBed } from "@angular/core/testing"
import { MatBottomSheet } from "@angular/material/bottom-sheet"
import { Subject } from "rxjs"
import type { PickedPassage } from "../components/passage-picker-sheet/passage-picker-sheet.component"
import { PassagePickerSheetComponent } from "../components/passage-picker-sheet/passage-picker-sheet.component"
import type { PassagePickerData } from "../utils/passage-picker"
import { BackButtonService } from "./back-button.service"
import type {
  ChromeInsets,
  NativeChromeAction,
  NativeChromeState,
} from "./native-chrome.service"
import { WebChromeBars } from "./web-chrome-bars.service"

describe("WebChromeBars", () => {
  let bars: WebChromeBars
  let sheet: { dismissed: Subject<PickedPassage | undefined> }
  let bottomSheet: jasmine.SpyObj<MatBottomSheet>
  let backButton: jasmine.SpyObj<BackButtonService>

  const SEARCH: NativeChromeState = {
    mode: "search",
    themeMode: "system",
    query: "",
    inert: false,
    collapsed: false,
    autoScroll: null,
  }

  beforeEach(() => {
    sheet = { dismissed: new Subject() }
    bottomSheet = jasmine.createSpyObj("MatBottomSheet", ["open"])
    bottomSheet.open.and.returnValue({
      afterDismissed: () => sheet.dismissed.asObservable(),
      dismiss: () => {},
    } as unknown as ReturnType<MatBottomSheet["open"]>)
    backButton = jasmine.createSpyObj("BackButtonService", ["closeOnBack"])
    TestBed.configureTestingModule({
      providers: [
        { provide: MatBottomSheet, useValue: bottomSheet },
        { provide: BackButtonService, useValue: backButton },
      ],
    })
    bars = TestBed.inject(WebChromeBars)
  })

  it("holds the state the bars render", () => {
    void bars.setState(SEARCH)
    expect(bars.state()).toEqual(SEARCH)
  })

  // An answer from before the bars rendered landed after their measurement,
  // and the page lost the space they cover.
  it("answers a new state with the bars' size once they are measured", async () => {
    let answered: ChromeInsets | undefined
    void bars.setState(SEARCH).then((insets) => {
      answered = insets
    })
    await Promise.resolve()
    expect(answered).toBeUndefined()

    bars.reportInsets({ top: 56, bottom: 64 })
    await Promise.resolve()
    expect(answered).toEqual({ top: 56, bottom: 64 })
  })

  it("tells listeners the bars' size when it changes", async () => {
    const heard: ChromeInsets[] = []
    await bars.addListener("insets", (insets) => heard.push(insets))

    bars.reportInsets({ top: 56, bottom: 64 })
    bars.reportInsets({ top: 56, bottom: 64 })
    bars.reportInsets({ top: 56, bottom: 0 })

    expect(heard).toEqual([
      { top: 56, bottom: 64 },
      { top: 56, bottom: 0 },
    ])
  })

  it("passes taps to listeners until they are removed", async () => {
    const heard: NativeChromeAction[] = []
    const handle = await bars.addListener("action", (action) =>
      heard.push(action),
    )
    bars.send({ id: "next" })
    await handle.remove()
    bars.send({ id: "previous" })

    expect(heard).toEqual([{ id: "next" }])
  })

  describe("the passage picker", () => {
    const data = {
      sections: [],
      currentBookId: "gen",
      currentChapter: 1,
    } as PassagePickerData

    it("opens as a bottom sheet that Android's back button closes", () => {
      void bars.showPicker(data)

      expect(bottomSheet.open).toHaveBeenCalledTimes(1)
      const [sheet, config] = bottomSheet.open.calls.mostRecent().args
      expect(sheet as unknown).toBe(PassagePickerSheetComponent)
      expect(config?.data).toBe(data)
      expect(backButton.closeOnBack).toHaveBeenCalledTimes(1)
    })

    it("goes to the passage picked", async () => {
      const heard: NativeChromeAction[] = []
      await bars.addListener("action", (action) => heard.push(action))
      void bars.showPicker(data)

      sheet.dismissed.next({ bookId: "jhn", chapter: 3 })
      expect(heard).toEqual([{ id: "goto", bookId: "jhn", chapter: 3 }])
    })

    it("goes nowhere when closed without a pick", async () => {
      const heard: NativeChromeAction[] = []
      await bars.addListener("action", (action) => heard.push(action))
      void bars.showPicker(data)

      sheet.dismissed.next(undefined)
      expect(heard).toEqual([])
    })
  })

  // NativeChromeService asks for these only in the iOS app.
  it("leaves the iOS shell's own sheets to the web app", async () => {
    expect(await bars.showBookmarks()).toEqual({ presented: false })
    expect(await bars.showFootnotes()).toEqual({ presented: false })
    expect(await bars.showReport()).toEqual({ presented: false })
    expect(
      await bars.showOnboarding({
        steps: [{ id: "welcome" }] as Parameters<
          WebChromeBars["showOnboarding"]
        >[0]["steps"],
      }),
    ).toEqual({ completed: false, lastStep: "welcome" })
  })
})
