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
import { PRIVACY_POLICY_URL } from "../../config"
import { AnalyticsService } from "../../services/analytics.service"
import type { DisplayVersion } from "../../services/build-version.service"
import { OnboardingService } from "../../services/onboarding.service"
import { PwaInstallService } from "../../services/pwa-install.service"
import { ThemeService } from "../../services/theme.service"

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
  readonly toggleViewMode = output<void>()
  readonly bookmarks = output<void>()
  readonly toggleAutoScrollControls = output<void>()
  readonly share = output<void>()
  readonly about = output<void>()
  readonly reportProblem = output<void>()

  readonly privacyPolicyUrl = PRIVACY_POLICY_URL
  /** Browsers that can't prompt (iOS, Firefox) get the tutorial's steps instead. */
  readonly canInstall = toSignal(this.pwaInstallService.canPromptInstall$, {
    requireSync: true,
  })

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

  openHelp(): void {
    this.onboardingService.open("menu")
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
