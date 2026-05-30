# CLAUDE.md

Angular 21 (standalone, `OnPush`) Bible reader, packaged for web + mobile via Capacitor.
Lint/format is **Biome** (`npm run biome` to fix, `npx @biomejs/biome check ./src` to check).
Typecheck with `npx tsc -p tsconfig.app.json --noEmit`. Tests via Karma (`npm test`).

## Code-review / "sloppiness" passes

When asked to review the code (quality, sloppiness, smells), be token-efficient — lead with
search signal, then read only the flagged ranges. Do NOT read files end-to-end up front.

1. Run `npx @biomejs/biome check ./src` first. It's fast and authoritative; trust it for
   formatting/lint coverage instead of eyeballing every file.
2. Rank files by size with `wc -l` and grep for smells:
   - AI-leftover monologue: `grep -rniE "let'?s |I'll|I will|the prompt asked|for now|actually,|TODO|FIXME" src --include="*.ts"`
   - Type/debug escapes: `grep -rnE ": any\b|as any|@ts-ignore|console\.(log|debug)" src --include="*.ts"`
3. Read only the 2–3 files those greps flag, and only the relevant line ranges (use Read
   `offset`/`limit`), not whole files.
4. Skip `*.spec.ts` unless tests are the subject.

This codebase is generally well-structured; sloppiness tends to be localized (historically the
reader component and animation service), so targeted reading beats a full sweep.
