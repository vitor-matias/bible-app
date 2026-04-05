import { Injector, NgZone } from "@angular/core"
import type { PluginListenerHandle } from "@capacitor/core"
import type { ConnectionStatus } from "@capacitor/network"
import { NetworkService } from "./network.service"

describe("NetworkService", () => {
  let service: NetworkService
  let ngZoneMock: jasmine.SpyObj<NgZone>
  let injectorMock: jasmine.SpyObj<Injector>
  let mockStatus: ConnectionStatus
  let mockNetworkListener: jasmine.SpyObj<PluginListenerHandle>
  let capturedCallback: ((status: ConnectionStatus) => void) | undefined
  // biome-ignore lint/suspicious/noExplicitAny: Mocking Capacitor plugin
  let mockNetworkPlugin: jasmine.SpyObj<any>

  beforeEach(async () => {
    mockStatus = {
      connected: true,
      connectionType: "wifi",
    }
    capturedCallback = undefined
    mockNetworkListener = jasmine.createSpyObj("PluginListenerHandle", [
      "remove",
    ])
    mockNetworkListener.remove.and.resolveTo()

    ngZoneMock = jasmine.createSpyObj("NgZone", ["run"])
    // biome-ignore lint/complexity/noBannedTypes: Mocking NgZone
    ngZoneMock.run.and.callFake((fn: Function) => fn())

    injectorMock = jasmine.createSpyObj<Injector>("Injector", ["get"])
    injectorMock.get.and.returnValue({
      preloadAllBooksAndChapters: jasmine
        .createSpy("preloadAllBooksAndChapters")
        .and.resolveTo(),
    })

    mockNetworkPlugin = jasmine.createSpyObj("Network", [
      "addListener",
      "getStatus",
    ])
    mockNetworkPlugin.addListener.and.callFake(
      (eventName: string, callback: (status: ConnectionStatus) => void) => {
        if (eventName === "networkStatusChange") {
          capturedCallback = callback
          return Promise.resolve(mockNetworkListener)
        }
        return Promise.resolve({
          remove: () => Promise.resolve(),
        } as PluginListenerHandle)
      },
    )
    mockNetworkPlugin.getStatus.and.callFake(() => Promise.resolve(mockStatus))

    // Directly instantiate the service without TestBed to avoid complex Angular 18+ environment issues
    service = new NetworkService(ngZoneMock, injectorMock, mockNetworkPlugin)

    // Flush microtasks to ensure initial getStatus resolves
    await Promise.resolve()
    await Promise.resolve()
  })

  it("should be created", () => {
    expect(service).toBeTruthy()
  })

  it("should handle initially connected state", () => {
    expect(service.isOffline).toBeFalse()
  })

  it("should handle initially disconnected state", async () => {
    mockStatus.connected = false
    mockStatus.connectionType = "none"

    // Instantiate new service - it will use the mocked Network plugin
    const newService = new NetworkService(
      ngZoneMock as NgZone,
      injectorMock,
      mockNetworkPlugin,
    )

    // Wait for constructor's init
    await Promise.resolve()
    await Promise.resolve()

    expect(newService.isOffline).toBeTrue()
  })

  it("should update offline state via network listener", () => {
    expect(capturedCallback).toBeDefined(
      "networkStatusChange listener should be registered",
    )

    if (capturedCallback) {
      capturedCallback({ connected: false, connectionType: "none" })
      expect(service.isOffline).toBeTrue()

      capturedCallback({ connected: true, connectionType: "wifi" })
      expect(service.isOffline).toBeFalse()
    }
  })

  it("should remove listener on destroy", async () => {
    service.ngOnDestroy()
    await Promise.resolve()
    expect(mockNetworkListener.remove).toHaveBeenCalled()
  })
})
