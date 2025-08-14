import { CommonModule } from "@angular/common"
import { Component, EventEmitter, Input, Output } from "@angular/core"
import { MatListModule } from "@angular/material/list"

import { MatButtonModule } from "@angular/material/button"
import { MatIconModule } from "@angular/material/icon"
import {
  MatTreeFlatDataSource,
  MatTreeFlattener,
  MatTreeModule,
} from "@angular/material/tree"

import { FlatTreeControl } from "@angular/cdk/tree"

interface BookNode {
  name: string
  books?: BookNode[] | string[]
}

interface ExampleFlatNode {
  expandable: boolean
  name: string
  level: number
}

@Component({
    selector: "book-selector",
    imports: [
        CommonModule,
        MatListModule,
        MatTreeModule,
        MatIconModule,
        MatButtonModule,
    ],
    templateUrl: "./book-selector.component.html",
    styleUrl: "./book-selector.component.css"
})
export class BookSelectorComponent {
  private _transformer = (node: BookNode | string, level: number) => {
    return {
      expandable:
        typeof node !== "string" && !!node.books && node.books.length > 0,
      name: typeof node !== "string" ? node.name : node,
      level: level,
    }
  }

  ntTreeControl = new FlatTreeControl<ExampleFlatNode>(
    (node) => node.level,
    (node) => node.expandable,
  )

  otTreeControl = new FlatTreeControl<ExampleFlatNode>(
    (node) => node.level,
    (node) => node.expandable,
  )

  otTreeFlattener = new MatTreeFlattener(
    this._transformer,
    (node) => node.level,
    (node) => node.expandable,
    (node) => (typeof node !== "string" ? node.books : null),
  )

  ntTreeFlattener = new MatTreeFlattener(
    this._transformer,
    (node) => node.level,
    (node) => node.expandable,
    (node) => (typeof node !== "string" ? node.books : null),
  )

  otDataSource = new MatTreeFlatDataSource(
    this.otTreeControl,
    this.otTreeFlattener,
  )
  ntDataSource = new MatTreeFlatDataSource(
    this.ntTreeControl,
    this.ntTreeFlattener,
  )

  constructor() {
    this.otDataSource.data = this.oldTestament
    this.ntDataSource.data = this.newTestament

    this.otTreeControl.expandAll()
    this.ntTreeControl.expandAll()
  }

  hasChild = (_: number, node: ExampleFlatNode) => node.expandable

  oldTestament = [
    {
      name: "Pentateuco",
      books: ["gen", "exo", "lev", "num", "deu"],
    },
    {
      name: "Livros Históricos",
      books: [
        "jos",
        "jdg",
        "rut",
        "1sa",
        "2sa",
        "1ki",
        "2ki",
        "1ch",
        "2ch",
        "ezr",
        "neh",
        "tob",
        "jdt",
        "est",
        "1ma",
        "2ma",
      ],
    },
    {
      name: "Livros Sapienciais",
      books: ["job", "psa", "pro", "ecc", "sng", "wis", "sir"],
    },
    {
      name: "Livros Proféticos",
      books: [
        "isa",
        "jer",
        "lam",
        "bar",
        "ezk",
        "dan",
        "hos",
        "jol",
        "amo",
        "oba",
        "jon",
        "mic",
        "nam",
        "hab",
        "zep",
        "hag",
        "zec",
        "mal",
      ],
    },
  ]

  newTestament = [
    {
      name: "Evangelhos e Atos",
      books: ["mat", "mrk", "luk", "jhn", "act"],
    },
    {
      name: "Cartas de São Paulo",
      books: [
        "rom",
        "1co",
        "2co",
        "gal",
        "eph",
        "php",
        "col",
        "1th",
        "2th",
        "1ti",
        "2ti",
        "tit",
        "phm",
      ],
    },
    {
      name: "Carta aos Hebreus",
      books: ["heb"],
    },
    {
      name: "Cartas Católicas",
      books: ["jas", "1pe", "2pe", "1jn", "2jn", "3jn", "jud"],
    },
    {
      name: "Apocalipse",
      books: ["rev"],
    },
    {
      name: "Sobre a Biblia",
      books: ["about"],
    },
  ]

  @Input()
  books: Book[] = []

  @Output() submitData = new EventEmitter<{ bookId: Book["id"] }>()

  getBook(bookId: string): Book | undefined {
    return this.books.find((book) => book.id === bookId)
  }

  submit(id: Book["id"]) {
    this.submitData.emit({ bookId: id })
  }

  onKeyPress(event: KeyboardEvent, id: Book["id"]): void {
    this.submit(id)
  }
}
