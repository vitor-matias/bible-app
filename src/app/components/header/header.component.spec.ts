import { CommonModule } from "@angular/common"
import { ChangeDetectorRef } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { Router } from "@angular/router"
import { Capacitor } from "@capacitor/core"
import { BehaviorSubject } from "rxjs"
import { SHARE_PLUGIN } from "../../tokens"
import { NetworkService } from "../../services/network.service"
import { HeaderComponent } from "./header.component"

describe("HeaderComponent", () => {
  let component: HeaderComponent
  let fixture: any
  let routerSpy: jasmine.SpyObj<Router>
  let networkServiceSpy: jasmine.SpyObj<NetworkService>
  let isOfflineSubject: BehaviorSubject<boolean>
  let mockSharePlugin: any

  beforeEach(async () => {
    routerSpy = jasmine.createSpyObj("Router", ["navigate"])
    isOfflineSubject = new BehaviorSubject<boolean>(false)
    networkServiceSpy = jasmine.createSpyObj("NetworkService", [], {
      isOffline$: isOfflineSubject.asObservable(),
      isOffline: false,
    })
    mockSharePlugin = jasmine.createSpyObj("Share", ["share"])

    await TestBed.configureTestingModule({
      imports: [HeaderComponent, CommonModule],
      providers: [
        { provide: Router, useValue: routerSpy },
        { provide: NetworkService, useValue: networkServiceSpy },
        { provide: ChangeDetectorRef, useValue: {} },
        { provide: SHARE_PLUGIN, useValue: mockSharePlugin },
      ],
    }).compileComponents()

    fixture = TestBed.createComponent(HeaderComponent)
    component = fixture.componentInstance
    component.book = { id: "gen", name: "Genesis" }
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

  it("should share using Capacitor Share on native platforms", async () => {
    spyOn(Capacitor, "isNativePlatform").and.returnValue(true)
    mockSharePlugin.share.and.resolveTo()
    
    if (typeof navigator.share !== "undefined") {
      spyOnProperty(navigator, "share", "get").and.returnValue(undefined as any)
    }

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
    if (typeof navigator.share === "undefined") {
      Object.defineProperty(navigator, "share", {
        get: () => shareSpy,
        configurable: true
      });
    } else {
      spyOnProperty(navigator, "share", "get").and.returnValue(shareSpy)
    }
    
    mockSharePlugin.share.and.resolveTo() // Should not be called

    component.chapterNumber = 1
    component.ngOnInit() // Re-init to pickup the web platform
    expect(component.canShare).toBeTrue()

    await component.sharePassage()

    expect(shareSpy).toHaveBeenCalled()
    expect(mockSharePlugin.share).not.toHaveBeenCalled()
  })
})
