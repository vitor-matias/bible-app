import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  inject,
  input,
  output,
  ViewChild,
} from "@angular/core"
import { toSignal } from "@angular/core/rxjs-interop"
import { MatDividerModule } from "@angular/material/divider"
import { MatIconModule } from "@angular/material/icon"
import { MatMenu, MatMenuModule } from "@angular/material/menu"
import { MatTooltipModule } from "@angular/material/tooltip"
import { PRIVACY_POLICY_URL, shareableUrl } from "../../config"
import { AnalyticsService } from "../../services/analytics.service"
import {
  AppPromoService,
  type StoreLink,
} from "../../services/app-promo.service"
import type { DisplayVersion } from "../../services/build-version.service"
import { OnboardingService } from "../../services/onboarding.service"
import { PwaInstallService } from "../../services/pwa-install.service"
import { TextAlignService } from "../../services/text-align.service"
import { ThemeService } from "../../services/theme.service"
import { ToastService } from "../../services/toast.service"

/**
 * The pages' menu button. What an entry opens gives the focus back to it on
 * closing: the entry itself is gone by then, and the focus fell to the page.
 */
export const MENU_BUTTON = ".menuButton"

/**
 * The menu of the reader's header, which the pastoral index shares: the page
 * opens it with `[matMenuTriggerFor]="menu.menu"` and answers what is its own.
 */
@Component({
  selector: "reader-menu",
  exportAs: "readerMenu",
  imports: [MatMenuModule, MatIconModule, MatDividerModule, MatTooltipModule],
  templateUrl: "./reader-menu.component.html",
  styleUrl: "./reader-menu.component.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReaderMenuComponent {
  private readonly themeService = inject(ThemeService)
  private readonly onboardingService = inject(OnboardingService)
  private readonly pwaInstallService = inject(PwaInstallService)
  private readonly cdr = inject(ChangeDetectorRef)
  private readonly textAlign = inject(TextAlignService)
  private readonly appPromo = inject(AppPromoService)
  private readonly toast = inject(ToastService)
  readonly analyticsService = inject(AnalyticsService)

  /** Static: the page's trigger reads it before this view's first check. */
  @ViewChild(MatMenu, { static: true }) menu!: MatMenu

  readonly canShare = input(false)
  /** Small print under the last item; null until it is known. */
  readonly version = input<DisplayVersion | null>(null)
  /** A chapter's way of reading, or null where there is none to switch. */
  readonly viewMode = input<"scrolling" | "paged" | null>(null)
  /** Whether auto-scroll's controls show, or null on a page without them. */
  readonly autoScrollControlsVisible = input<boolean | null>(null)

  readonly decreaseFontSize = output<void>()
  readonly increaseFontSize = output<void>()
  readonly resetFontSize = output<void>()
  readonly toggleViewMode = output<void>()
  readonly bookmarks = output<void>()
  readonly toggleAutoScrollControls = output<void>()
  readonly share = output<void>()
  readonly about = output<void>()
  readonly reportProblem = output<void>()

  readonly privacyPolicyUrl = PRIVACY_POLICY_URL
  /** Where the page can't share (desktop browsers), the link can be copied. */
  readonly canCopyLink =
    typeof navigator !== "undefined" &&
    typeof navigator.clipboard?.writeText === "function"
  /** Browsers that can't prompt (iOS, Firefox) get the tutorial's steps instead. */
  readonly canInstall = toSignal(this.pwaInstallService.canPromptInstall$, {
    requireSync: true,
  })
  /** The native app's store for this phone or tablet, if it has one. */
  readonly appStore = this.appPromo.deviceStore("menu")
  /** Read at each check: installing the website mid-visit changes the words. */
  get appStoreLabel(): string {
    return this.appStore ? this.appPromo.menuLabel(this.appStore) : ""
  }

  /** For the page's trigger: the store entry tells the visitor about the app,
   *  so no prompt follows it. */
  opened(): void {
    if (this.appStore) this.appPromo.markSeen()
  }

  /** The menu link itself opens the store. */
  openAppStore(store: StoreLink): void {
    this.appPromo.trackStoreOpen(store, "menu")
  }

  getTextAlignIcon(): string {
    return this.textAlign.ragged ? "format_align_left" : "format_align_justify"
  }

  getTextAlignTooltip(): string {
    return this.textAlign.ragged
      ? "Alinhado à esquerda (clique para justificar)"
      : "Justificado (clique para alinhar à esquerda)"
  }

  /** As the theme: the menu stays open, and the text realigns behind it. */
  onToggleTextAlign(): void {
    this.textAlign.toggle()
    this.cdr.detectChanges()
  }

  getThemeIcon(): string {
    const mode = this.themeService.currentMode
    if (mode === "system") return "brightness_auto"
    return mode === "light" ? "light_mode" : "dark_mode"
  }

  getThemeTooltip(): string {
    const mode = this.themeService.currentMode
    // Says which theme is on: the button cycles through them.
    if (mode === "system") return "Tema: Automático"
    return mode === "light" ? "Tema: Claro" : "Tema: Escuro"
  }

  /**
   * One button cycles through the three themes. The menu stays open, so the
   * page changes theme behind it and the icon shows the new one.
   */
  onToggleTheme(): void {
    this.themeService.toggleTheme()
    this.cdr.detectChanges()
  }

  getViewModeIcon(): string {
    return this.viewMode() === "scrolling" ? "swipe_vertical" : "auto_stories"
  }

  getViewModeTooltip(): string {
    return this.viewMode() === "scrolling"
      ? "Texto contínuo (clique para mudar para página a página)"
      : "Página a página (clique para mudar para texto contínuo)"
  }

  async copyLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(shareableUrl(window.location))
      this.toast.show("Ligação copiada")
    } catch {
      // The browser refused; nothing was copied, so nothing to confirm.
    }
  }

  openHelp(): void {
    this.onboardingService.open("menu", MENU_BUTTON)
  }

  async install(): Promise<void> {
    const outcome = await this.pwaInstallService.promptInstall()
    // AnalyticsService.track overwrites `platform`, hence the distinct key.
    void this.analyticsService.track("pwa_install_prompt", {
      outcome,
      installPlatform: this.pwaInstallService.detectPlatform(),
    })
  }
}
