import { CommonModule } from "@angular/common"
import { ChangeDetectorRef } from "@angular/core"
import { type ComponentFixture, TestBed } from "@angular/core/testing"
import { Router } from "@angular/router"
import { Capacitor } from "@capacitor/core"
import type { Share } from "@capacitor/share"
import { BehaviorSubject } from "rxjs"
import { NetworkService } from "../../services/network.service"
import { SHARE_PLUGIN } from "../../tokens"
import { HeaderComponent } from "./header.component"

describe("HeaderComponent", () => {
  let component: HeaderComponent
  let fixture: ComponentFixture<HeaderComponent>
  let routerSpy: jasmine.SpyObj<Router>
  let networkServiceSpy: jasmine.SpyObj<NetworkService>
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
    mockSharePlugin = jasmine.createSpyObj("Share", ["share"])
    originalShare = navigator.share

    const cdrSpy = jasmine.createSpyObj<ChangeDetectorRef>("ChangeDetectorRef", [
      "detectChanges",
    ])

    await TestBed.configureTestingModule({
      imports: [HeaderComponent, CommonModule],
      providers: [
        { provide: Router, useValue: routerSpy },
        { provide: NetworkService, useValue: networkServiceSpy },
        { provide: ChangeDetectorRef, useValue: cdrSpy },
        { provide: SHARE_PLUGIN, useValue: mockSharePlugin },
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
