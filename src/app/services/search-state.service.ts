import { Injectable } from "@angular/core"

export interface SearchState {
  searchTerm: string
  searchResults: Verse[]
  currentPage: number
  totalResults: number
}

@Injectable({ providedIn: "root" })
export class SearchStateService {
  private cachedState: SearchState | null = null

  save(state: SearchState): void {
    this.cachedState = { ...state, searchResults: [...state.searchResults] }
  }

  restore(): SearchState | null {
    return this.cachedState
  }

  clear(): void {
    this.cachedState = null
  }
}
