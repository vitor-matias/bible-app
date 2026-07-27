# CLAUDE.md

Angular 22 (standalone, `OnPush`) Bible reader, packaged for web + mobile via Capacitor.
Lint/format is **Biome** (`npm run biome` to fix, `npx @biomejs/biome check ./src` to check).
Typecheck with `npx tsc -p tsconfig.app.json --noEmit`. Tests via Karma (`npm test`).

## Definition of done (required before finishing)

Whenever you change code under `src/`, before you finish:

1. **Lint** — `npx @biomejs/biome check ./src` must pass.
2. **Typecheck** — `npx tsc -p tsconfig.app.json --noEmit` must pass.
3. **Tests** — `npx ng test --watch=false --browsers=ChromeHeadlessNoSandbox` must pass.
4. **New behavior gets new tests.** Any new feature, branch, or bug fix must come with
   new or updated `*.spec.ts` that would fail without your change. A bug fix should add a
   regression test that reproduces the bug. Don't ship logic with no test exercising it.

A `Stop` hook (`.claude/hooks/verify.sh`, wired in `.claude/settings.json`) runs 1–3
automatically in the background when `src/` has pending changes and re-wakes you if any
fail — but treat the list above as the standard regardless. The hook can't judge #4; that's
on you. Prefer `TestBed` over `new Component(...)` in specs so DI/injection-context
regressions are caught (constructing components by hand has bitten this repo before).

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
