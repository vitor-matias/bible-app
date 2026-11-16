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

/**
 * One link to share everywhere: the website and both store listings. A phone
 * or tablet is sent on to its own store after a moment, unless told to stay.
 */
@Component({
  selector: "landing",
  imports: [RouterLink],
  template: `
    <main class="landing" [style.--auto-open]="autoOpenMs + 'ms'">
      <img src="icons/512X512_REDONDO.png" alt="" width="96" height="96" />
      <h1>Bíblia Sagrada</h1>
      <p>Leia no navegador ou instale a aplicação.</p>
      <nav aria-label="Onde ler">
        <a routerLink="/">Abrir no navegador</a>
        <a routerLink="/ios" [class.auto]="auto() === 'ios'" (click)="stay()">App Store</a>
        <a routerLink="/android" [class.auto]="auto() === 'android'" (click)="stay()">Google Play</a>
      </nav>
      @if (auto(); as store) {
        <p class="status" role="status">
          A abrir {{ store === "ios" ? "a App Store" : "o Google Play" }}…
          <button type="button" (click)="stay()">Cancelar</button>
        </p>
      }
    </main>
  `,
  styles: `
    .landing {
      max-width: 22em; margin: 0 auto; padding: 72px 16px; text-align: center;
      color: var(--text-color);
    }
    img { border-radius: 50%; }
    h1 { margin: 16px 0 4px; font-family: var(--font-reading); }
    nav { display: grid; gap: 12px; margin-top: 32px; }
    a {
      position: relative; overflow: hidden; display: block; padding: 14px 16px;
      border: 1px solid currentColor; border-radius: 999px;
      color: inherit; font-weight: 600; text-decoration: none;
    }
    a:hover { background: color-mix(in srgb, currentColor 8%, transparent); }
    /* The countdown: the pill of the store about to open fills up. */
    a.auto::before {
      content: ""; position: absolute; inset: 0;
      background: color-mix(in srgb, currentColor 35%, transparent);
      transform-origin: left; animation: fill var(--auto-open) linear both;
    }
    @keyframes fill { from { transform: scaleX(0); } }
    .status { margin-top: 20px; }
    button {
      min-height: 44px; padding: 0 12px; border: 0; background: none;
      color: inherit; font: inherit; text-decoration: underline; cursor: pointer;
    }
  `,
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
      if (platform === "desktop") return
      this.auto.set(platform)
      // The /ios and /android routes do the leaving, as for their short links.
      this.timer = setTimeout(
        () => void this.router.navigateByUrl(`/${platform}`),
        AUTO_OPEN_MS,
      )
    })
  }

  /** Also on a store link's tap: the visitor chose, the countdown must not. */
  protected stay(): void {
    clearTimeout(this.timer)
    this.auto.set(null)
  }
}
