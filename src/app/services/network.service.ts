import { Inject, Injectable, Injector, NgZone } from "@angular/core"
import { Capacitor, type PluginListenerHandle } from "@capacitor/core"
import { type ConnectionStatus, type NetworkPlugin } from "@capacitor/network"
import { BehaviorSubject, type Observable } from "rxjs"
import { NETWORK_PLUGIN } from "../tokens"

@Injectable({
  providedIn: "root",
})
export class NetworkService {
  private isOfflineSubject = new BehaviorSubject<boolean>(false)
  public isOffline$: Observable<boolean> = this.isOfflineSubject.asObservable()
  private networkListener?: Promise<PluginListenerHandle> | PluginListenerHandle

  constructor(
    private ngZone: NgZone,
    private injector: Injector,
    @Inject(NETWORK_PLUGIN) private networkPlugin: NetworkPlugin,
  ) {
    this.initNetworkListener()
  }

  get isOffline(): boolean {
    return this.isOfflineSubject.value
  }

  private async initNetworkListener() {
    try {
      const status = await this.networkPlugin.getStatus()
      this.updateStatus(status)
    } catch {
      this.updateStatus({ connected: true, connectionType: "unknown" })
    }

    try {
      this.networkListener = this.networkPlugin.addListener(
        "networkStatusChange",
        (status: ConnectionStatus) => {
          this.ngZone.run(() => {
            this.updateStatus(status)
          })
        },
      )
    } catch {
      // safe fallback
    }
  }

  private updateStatus(status: ConnectionStatus) {
    const wasOffline = this.isOfflineSubject.value
    const nowOnline = status.connected
    this.isOfflineSubject.next(!nowOnline)

    // When we transition from offline → online, opportunistically refresh
    // the Bible content cache if it has expired.
    if (wasOffline && nowOnline) {
      // Lazy-inject to avoid a circular dependency at construction time.
      void (async () => {
        try {
          const { OfflineDataService } = await import("./offline-data.service")
          const svc = this.injector.get(OfflineDataService)
          await svc.preloadAllBooksAndChapters("standalone")
        } catch (error) {
          console.error("Failed to preload offline Bible content after reconnect", error)
        }
      })()
    }
  }

  async ngOnDestroy(): Promise<void> {
    if (this.networkListener) {
      try {
        const listener = await this.networkListener
        if (Capacitor.isNativePlatform()) {
          await listener.remove()
        } else {
          // On web, remove() might not be implemented or cause errors
          await listener.remove()
        }
      } catch {
        // Ignore errors during cleanup on web
      }
    }
  }
}
