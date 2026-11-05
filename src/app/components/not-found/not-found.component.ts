import {
  ChangeDetectionStrategy,
  Component,
  inject,
  type OnInit,
} from "@angular/core"
import { Meta, Title } from "@angular/platform-browser"
import { RouterLink } from "@angular/router"

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
    a { color: inherit; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotFoundComponent implements OnInit {
  private title = inject(Title)
  private meta = inject(Meta)

  ngOnInit(): void {
    this.title.setTitle("Capítulo não encontrado | Bíblia Sagrada")
    this.meta.updateTag({ name: "robots", content: "noindex" })
  }
}
