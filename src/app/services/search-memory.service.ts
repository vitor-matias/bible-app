import { Injectable } from "@angular/core"

/** A word search's results as the page left them (SearchComponent). */
export interface SearchSnapshot {
  term: string
  results: Verse[]
  total: number
  page: number
  /** The stored Bible's matches, when the search ran without the server. */
  storedMatches: Verse[] | null
  scrollTop: number
}

/**
 * The last search, kept while the app runs: Back from a result returns to
 * /search?q=… and finds the list where it was, without asking the server
 * again (its searches are rate-limited).
 */
@Injectable({ providedIn: "root" })
export class SearchMemoryService {
  last: SearchSnapshot | null = null
}
