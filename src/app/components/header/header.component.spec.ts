import { CommonModule } from "@angular/common"
import { type ComponentFixture, TestBed } from "@angular/core/testing"
import { MatBottomSheet } from "@angular/material/bottom-sheet"
import { MatDialog } from "@angular/material/dialog"
import { Router } from "@angular/router"
import { BehaviorSubject, of } from "rxjs"
import { AnalyticsService } from "../../services/analytics.service"
import { BookmarkService } from "../../services/bookmark.service"
import { NetworkService } from "../../services/network.service"
import { ShareService } from "../../services/share.service"
import { ThemeService } from "../../services/theme.service"
import { ReportProblemComponent } from "../report-problem/report-problem.component"
import { HeaderComponent } from "./header.component"

describe("HeaderComponent", () => {
  let component: HeaderComponent
  let fixture: ComponentFixture<HeaderComponent>
  let routerSpy: jasmine.SpyObj<Router>
  let networkServiceSpy: jasmine.SpyObj<NetworkService>
  let themeServiceSpy: jasmine.SpyObj<ThemeService>
  let bookmarkServiceSpy: jasmine.SpyObj<BookmarkService>
  let bottomSheetSpy: jasmine.SpyObj<MatBottomSheet>
  let dialogSpy: jasmine.SpyObj<MatDialog>
  let analyticsServiceSpy: jasmine.SpyObj<AnalyticsService>
  let shareServiceSpy: jasmine.SpyObj<ShareService>
  let isOfflineSubject: BehaviorSubject<boolean>
  let themeModeSubject: BehaviorSubject<"light" | "dark" | "system">
  let canShare: boolean

  beforeEach(async () => {
    routerSpy = jasmine.createSpyObj("Router", ["navigate"])
    isOfflineSubject = new BehaviorSubject<boolean>(false)
    themeModeSubject = new BehaviorSubject<"light" | "dark" | "system">(
      "system",
    )
    canShare = true
    networkServiceSpy = jasmine.createSpyObj("NetworkService", [], {
      isOffline$: isOfflineSubject.asObservable(),
      isOffline: false,
    })
    themeServiceSpy = jasmine.createSpyObj("ThemeService", ["toggleTheme"], {
      currentMode: "system",
      themeMode$: themeModeSubject.asObservable(),
    })

    bookmarkServiceSpy = jasmine.createSpyObj("BookmarkService", [
      "getBookmark",
    ])
    bookmarkServiceSpy.bookmarks$ = of([])
    bottomSheetSpy = jasmine.createSpyObj("MatBottomSheet", ["open"])
    dialogSpy = jasmine.createSpyObj("MatDialog", ["open"])
    analyticsServiceSpy = jasmine.createSpyObj("AnalyticsService", [
      "track",
      "areAnalyticsAvailable",
    ])
    analyticsServiceSpy.track.and.returnValue(Promise.resolve())
    analyticsServiceSpy.areAnalyticsAvailable.and.returnValue(true)

    shareServiceSpy = jasmine.createSpyObj("ShareService", ["share"])
    Object.defineProperty(shareServiceSpy, "canShare", {
      configurable: true,
      get: () => canShare,
    })
    shareServiceSpy.share.and.returnValue(Promise.resolve())

    await TestBed.configureTestingModule({
      imports: [HeaderComponent, CommonModule],
      providers: [
        { provide: Router, useValue: routerSpy },
        { provide: NetworkService, useValue: networkServiceSpy },
        { provide: ThemeService, useValue: themeServiceSpy },
        { provide: BookmarkService, useValue: bookmarkServiceSpy },
        { provide: MatBottomSheet, useValue: bottomSheetSpy },
        { provide: MatDialog, useValue: dialogSpy },
        { provide: AnalyticsService, useValue: analyticsServiceSpy },
        { provide: ShareService, useValue: shareServiceSpy },
      ],
    }).compileComponents()

    fixture = TestBed.createComponent(HeaderComponent)
    component = fixture.componentInstance
    component.book = {
      id: "gen",
      name: "Genesis",
      shortName: "",
      abrv: "",
      chapterCount: 50,
    }
    fixture.detectChanges()
  })

  it("should create", () => {
    expect(component).toBeTruthy()
  })

  it("should reflect offline status from NetworkService", () => {
    isOfflineSubject.next(true)
    fixture.detectChanges()

    expect(component.isOffline).toBeTrue()
  })

  it("should open the report problem dialog from the menu", () => {
    const trigger = jasmine.createSpyObj("MatMenuTrigger", ["closeMenu"])
    component.chapterNumber = 3

    component.onReportProblem(trigger)

    expect(trigger.closeMenu).toHaveBeenCalled()
    expect(dialogSpy.open).toHaveBeenCalledWith(ReportProblemComponent, {
      data: { book: component.book, chapter: 3 },
      width: "90%",
      maxWidth: "500px",
    })
  })

  it("should not open the report problem dialog when chapter context is missing", () => {
    const trigger = jasmine.createSpyObj("MatMenuTrigger", ["closeMenu"])

    component.chapterNumber = undefined as unknown as number
    component.onReportProblem(trigger)

    expect(trigger.closeMenu).toHaveBeenCalled()
    expect(dialogSpy.open).not.toHaveBeenCalled()
  })

  it("should delegate sharing to ShareService with the current chapter", async () => {
    component.chapterNumber = 1
    const trigger = jasmine.createSpyObj("MatMenuTrigger", ["closeMenu"])

    await component.onShare(trigger)

    expect(trigger.closeMenu).toHaveBeenCalled()
    expect(shareServiceSpy.share).toHaveBeenCalledWith(component.book, 1)
  })

  it("should show the share menu item when sharing is available", () => {
    canShare = true
    fixture.detectChanges()

    expect(component.shareService.canShare).toBeTrue()
  })

  it("should hide the share menu item when sharing is unavailable", () => {
    canShare = false
    fixture.detectChanges()

    expect(component.shareService.canShare).toBeFalse()
  })
})
