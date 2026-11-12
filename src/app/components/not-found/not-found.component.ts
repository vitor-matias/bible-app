import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  type OnDestroy,
  type OnInit,
} from "@angular/core"
import { takeUntilDestroyed } from "@angular/core/rxjs-interop"
import { Meta, Title } from "@angular/platform-browser"
import { Router, RouterLink } from "@angular/router"
import { NativeChromeService } from "../../services/native-chrome.service"
import { ThemeService } from "../../services/theme.service"

/** What a link to a book or chapter that does not exist lands on. */
@Component({
  selector: "not-found",
  imports: [RouterLink],
  template: `
    <main class="not-found">
      <h1>Capítulo não encontrado</h1>
      <p>Este livro ou capítulo não existe. Escolha um na lista de livros.</p>
      <p><a routerLink="/livros">Livros da Bíblia</a> · <a routerLink="/">Início</a></p>
    </main>
  `,
  styles: `
    .not-found { max-width: 32em; margin: 0 auto; padding: 72px 16px; color: var(--text-color); }
    /* Under the apps' bars, which float over the page. */
    :host-context(.native-chrome) .not-found {
      padding-top: calc(24px + var(--native-chrome-top, env(safe-area-inset-top)));
    }
    a { color: inherit; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotFoundComponent implements OnInit, OnDestroy {
  private title = inject(Title)
  private meta = inject(Meta)
  private nativeChrome = inject(NativeChromeService)
  private themeService = inject(ThemeService)
  private router = inject(Router)
  private destroyRef = inject(DestroyRef)

  ngOnInit(): void {
    this.title.setTitle("Capítulo não encontrado | Bíblia Sagrada")
    this.meta.updateTag({ name: "robots", content: "noindex" })

    // Without bars the apps' status bar kept the web header's light icons,
    // white on this page's cream, and the page had no way back but Back.
    if (this.nativeChrome.enabled) {
      this.nativeChrome.show({
        mode: "page",
        themeMode: this.themeService.currentMode,
        title: "Bíblia Sagrada",
        search: true,
      })
      this.nativeChrome.actions$
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(({ id }) => {
          if (id === "back") void this.router.navigate(["/"])
          if (id === "search") void this.router.navigate(["/search"])
        })
    }
  }

  ngOnDestroy(): void {
    if (this.nativeChrome.enabled) this.nativeChrome.hide()
  }
}
