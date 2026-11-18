import { Injectable, signal } from "@angular/core"

/**
 * The theme open on the Índice Bíblico-Pastoral, for the reader that hosts the
 * page: a theme opens in place, without a navigation, so the reader's own
 * route never says which one the header's ribbon and share text are about.
 */
@Injectable({ providedIn: "root" })
export class PastoralIndexState {
  /** The slug of the theme open, or null when none is. Set by the page. */
  readonly slug = signal<string | null>(null)
}
