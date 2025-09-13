import { Injectable } from '@angular/core';

export type VerseReference =
  | { type: 'single'; verse: number }
  | { type: 'range'; start: number; end: number };

export interface BibleReference {
  match: string;
  index: number;
  book: string;
  chapter: number;
  verses?: VerseReference[]; // optional if not provided
}

@Injectable({ providedIn: 'root' })
export class BibleReferenceService {
  /**
   * Matches:
   *  - John 3:16
   *  - john 3
   *  - 1 John 4:7–8, 12
   *  - Genesis 1:1-3
   *  - mt 5,3-12
   *  - Apoc 21
   *
   * Notes:
   *  - case-insensitive
   *  - book may have 1–3 prefix
   *  - chapter required
   *  - verses optional
   */
  private readonly bibleRefRegex =
    /\b(?:(?<booknum>[1-3])\s*)?(?<book>(?:[A-Za-zÀ-ÿ][a-zà-ÿ]*\.?)(?:\s+[A-Za-zÀ-ÿ][a-zà-ÿ]*\.?)*)\s*(?<chapter>\d+)(?:\s*[:.,]\s*(?<verses>\d+(?:[-–]\d+)?(?:\s*[,;]\s*\d+(?:[-–]\d+)?)*)\b)?/gi;

  extract(text: string): BibleReference[] {
    if (!text) return [];
    const results: BibleReference[] = [];
    this.bibleRefRegex.lastIndex = 0;

    for (const m of text.matchAll(this.bibleRefRegex)) {
      const groups = m.groups as
        | { booknum?: string; book: string; chapter: string; verses?: string }
        | undefined;
      if (!groups) continue;

      const book =
        (groups.booknum ? groups.booknum.trim() + ' ' : '') + groups.book.trim();

      results.push({
        match: m[0],
        index: m.index ?? 0,
        book,
        chapter: Number(groups.chapter),
        verses: groups.verses ? this.parseVerses(groups.verses) : undefined,
      });
    }
    return results;
  }

  private parseVerses(versesStr: string): VerseReference[] {
    return versesStr
      .split(/[;,]\s*/g)
      .filter(Boolean)
      .map<VerseReference>((part) => {
        const [aStr, bStr] = part.split(/[-–]/).map((s) => s.trim());
        const a = Number(aStr);
        const b = bStr !== undefined ? Number(bStr) : NaN;
        if (!Number.isNaN(a) && !Number.isNaN(b)) {
          return { type: 'range', start: Math.min(a, b), end: Math.max(a, b) };
        }
        return { type: 'single', verse: a };
      });
  }
}
