import { CommonModule } from "@angular/common"
import { type ComponentFixture, TestBed } from "@angular/core/testing"
import { MatBottomSheet } from "@angular/material/bottom-sheet"
import { MatDialog } from "@angular/material/dialog"
import { Router } from "@angular/router"
import { Capacitor } from "@capacitor/core"
import type { Share } from "@capacitor/share"
import { BehaviorSubject, of } from "rxjs"
import { BookmarkService } from "../../services/bookmark.service"
import { NetworkService } from "../../services/network.service"
import { ThemeService } from "../../services/theme.service"
import { SHARE_PLUGIN } from "../../tokens"
import { ReportProblemComponent } from "../report-problem/report-problem.component"
import { HeaderComponent } from "./header.component"
import { AnalyticsService } from "../../services/analytics.service"

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
  let isOfflineSubject: BehaviorSubject<boolean>
  let mockSharePlugin: jasmine.SpyObj<typeof Share>
  let originalShare: typeof navigator.share

  beforeEach(async () => {
    routerSpy = jasmine.createSpyObj("Router", ["navigate"])
    isOfflineSubject = new BehaviorSubject<boolean>(false)
    networkServiceSpy = jasmine.createSpyObj("NetworkService", [], {
      isOffline$: isOfflineSubject.asObservable(),
      isOffline: false,
    })
    themeServiceSpy = jasmine.createSpyObj("ThemeService", ["toggleTheme"], {
      currentMode: "system",
    })
    bookmarkServiceSpy = jasmine.createSpyObj("BookmarkService", [
      "getBookmark",
    ])
    bookmarkServiceSpy.bookmarks$ = of([])
    bottomSheetSpy = jasmine.createSpyObj("MatBottomSheet", ["open"])
    dialogSpy = jasmine.createSpyObj("MatDialog", ["open"])
    mockSharePlugin = jasmine.createSpyObj("Share", ["share"])
    analyticsServiceSpy = jasmine.createSpyObj("AnalyticsService", ["track"])
    originalShare = navigator.share

    await TestBed.configureTestingModule({
      imports: [HeaderComponent, CommonModule],
      providers: [
        { provide: Router, useValue: routerSpy },
        { provide: NetworkService, useValue: networkServiceSpy },
        { provide: ThemeService, useValue: themeServiceSpy },
        { provide: BookmarkService, useValue: bookmarkServiceSpy },
        { provide: MatBottomSheet, useValue: bottomSheetSpy },
        { provide: MatDialog, useValue: dialogSpy },
        { provide: SHARE_PLUGIN, useValue: mockSharePlugin },
        { provide: AnalyticsService, useValue: analyticsServiceSpy },
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

  afterEach(() => {
    if (originalShare === undefined) {
      // @ts-expect-error
      delete navigator.share
    } else {
      Object.defineProperty(navigator, "share", {
        value: originalShare,
        configurable: true,
        writable: true,
      })
    }
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

  it("should share using Capacitor Share on native platforms", async () => {
    spyOn(Capacitor, "isNativePlatform").and.returnValue(true)
    mockSharePlugin.share.and.resolveTo()

    if (!navigator.share) {
      Object.defineProperty(navigator, "share", {
        value: () => Promise.resolve(),
        configurable: true,
        writable: true,
      })
    }
    spyOn(navigator, "share").and.resolveTo()

    component.chapterNumber = 1
    component.ngOnInit() // Re-init to pickup the new native platform check

    expect(component.canShare).toBeTrue()

    await component.sharePassage()

    expect(mockSharePlugin.share).toHaveBeenCalledWith({
      title: "Biblia Sagrada",
      text: jasmine.any(String),
      url: jasmine.any(String),
      dialogTitle: "Partilhar passagem",
    })
  })

  it("should share using navigator.share on web platforms", async () => {
    spyOn(Capacitor, "isNativePlatform").and.returnValue(false)

    const shareSpy = jasmine.createSpy("share").and.resolveTo()

    if (!navigator.share) {
      Object.defineProperty(navigator, "share", {
        value: () => Promise.resolve(),
        configurable: true,
        writable: true,
      })
    }
    spyOn(navigator, "share").and.callFake(shareSpy)

    mockSharePlugin.share.and.resolveTo() // Should not be called

    component.chapterNumber = 1
    component.ngOnInit() // Re-init to pickup the web platform
    expect(component.canShare).toBeTrue()

    await component.sharePassage()

    expect(shareSpy).toHaveBeenCalled()
    expect(mockSharePlugin.share).not.toHaveBeenCalled()
  })
})
