import { Inject, Injectable, NgZone } from "@angular/core"
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
    @Inject(NETWORK_PLUGIN) private networkPlugin: NetworkPlugin,
  ) {
    this.initNetworkListener()
  }

  get isOffline(): boolean {
    return this.isOfflineSubject.value
  }

  private async initNetworkListener() {
    const status = await this.networkPlugin.getStatus()
    this.updateStatus(status)

    this.networkListener = this.networkPlugin.addListener(
      "networkStatusChange",
      (status: ConnectionStatus) => {
        this.ngZone.run(() => {
          this.updateStatus(status)
        })
      },
    )
  }

  private updateStatus(status: ConnectionStatus) {
    this.isOfflineSubject.next(!status.connected)
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
