import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  signal,
} from "@angular/core"
import { Router, RouterLink } from "@angular/router"
import { Capacitor } from "@capacitor/core"
import { PwaInstallService } from "../../services/pwa-install.service"
import { SeoService } from "../../services/seo.service"

/** How long a phone's visitor sees the page before its store opens. */
export const AUTO_OPEN_MS = 2500

/** Set once the visitor chose for themselves; lasts as long as the tab. */
export const CHOSE_KEY = "landing-chose"

// Storage throws where the browser blocks it; the countdown then just runs.
function chose(): boolean {
  try {
    return sessionStorage.getItem(CHOSE_KEY) !== null
  } catch {
    return false
  }
}

/**
 * Googlebot Smartphone says Android; a crawler must index this page, not
 * leave it. Crawlers name themselves "…bot/1.0" or give a "+http…" address;
 * a bare "bot" would also catch phones such as "CUBOT NOTE 20".
 */
const isCrawler = () =>
  /bot\/|crawler|spider|\+https?:/i.test(navigator.userAgent)

function rememberChoice(): void {
  try {
    sessionStorage.setItem(CHOSE_KEY, "1")
  } catch {}
}

/**
 * One link to share everywhere: the website and both store listings. A phone
 * or tablet is sent on to its own store after a moment, unless told to stay.
 */
@Component({
  selector: "landing",
  imports: [RouterLink],
  templateUrl: "./landing.component.html",
  styleUrl: "./landing.component.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LandingComponent {
  private router = inject(Router)
  private platform = inject(PwaInstallService).detectPlatform()
  private timer?: ReturnType<typeof setTimeout>

  protected readonly autoOpenMs = AUTO_OPEN_MS
  /** The store this device is about to be sent to, if any. */
  protected readonly auto = signal<"ios" | "android" | null>(null)

  constructor() {
    inject(SeoService).updateForLanding()
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer))

    // Browser only, as the prerender cannot know the device.
    afterNextRender(() => {
      // The apps open the site's links: whoever scans the code with the app
      // installed already has what this page offers.
      if (Capacitor.isNativePlatform()) {
        void this.router.navigateByUrl("/", { replaceUrl: true })
        return
      }
      const platform = this.platform
      // Back to this page must not send away someone who already chose.
      if (platform === "desktop" || chose() || isCrawler()) return
      this.auto.set(platform)
      // The /ios and /android routes do the leaving, as for their short links.
      this.timer = setTimeout(
        () => void this.router.navigateByUrl(`/${platform}`),
        AUTO_OPEN_MS,
      )
    })
  }

  /** Also on a link's tap: the visitor chose, the countdown must not. */
  protected stay(): void {
    rememberChoice()
    clearTimeout(this.timer)
    this.auto.set(null)
  }
}
