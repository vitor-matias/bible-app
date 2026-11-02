# Build, dependencies and git workflow

## Reproducing the build failures locally

CI's *build* job (and the *android* job, which builds the web bundle first) can go red while
lint and unit tests are green. Reproduce a production build without waiting for the
prerenderer, in about ten seconds:

```bash
PRERENDER_API_ORIGIN=http://127.0.0.1:1 npx ng build --configuration production
```

Port 1 refuses the connection, so only two routes are prerendered; the build still type-checks,
applies the production budgets and compiles every component style. The usual cause of a
build-only failure is a budget in `angular.json`: `anyComponentStyle` warns at 4 kB and fails
at 6 kB, and `bible-reader.component.css` is close to that cap (about 5.9 kB minified when
this was written). Put global rules in `src/styles.css`, which has no component budget.

## Dependencies

### npm overrides

`package.json` carries `overrides` (`tar`, `sharp`, `uuid`, `@hono/node-server`, `minimatch`,
`@xmldom/xmldom`) that patch advisories in build tooling npm cannot otherwise fix. Most exist
because the pinned `@capacitor/assets` 3.0.5 pins `sharp` at exactly 0.32.6 and depends on
`@capacitor/cli` 5.x, which drags in `tar` 6. Version 4 of `@capacitor/assets` is out and
depends on a current `sharp` and no longer on the old CLI: upgrading it is the first thing to
try before adding more overrides, then remove the overrides it makes redundant and check
`npm audit`.

npm applies overrides only during a full tree resolution. A targeted
`npm install --save-dev <pkg>` leaves nested copies at their vulnerable versions: a bump of
`jasmine-core` once silently restored `@capacitor/assets/node_modules/tar@6`, and an advisory
reappeared while `package.json` still showed the override. After any targeted install:

```bash
npm audit                      # and npm audit --omit=dev, which is what ships and has been clean
rm -rf node_modules package-lock.json && npm install   # to repair
npm ci                         # what CI runs; the lockfile is what actually ships
```

### Angular packages move in lockstep

Angular framework packages peer-pin each other to an exact version (`platform-server`
at `22.1.4` peers `common`, `compiler`, `core` and `platform-browser` at `22.1.4`;
`material` pins `cdk`; `animations` pins `core`). There is no `.github/dependabot.yml`, so a
security PR that bumps one `@angular/*` package leaves its siblings in the lockfile at the old
version and `npm ci` fails with `ERESOLVE`, which turns lint, test and build red before any
code runs. `npm install --package-lock-only @angular/core@X @angular/common@X ...` still fails,
and so does asking Dependabot to rebase.

Do not debug the code. In a separate PR (Dependabot stops maintaining a branch you edit):

1. Set `^X` in `package.json` for `animations`, `cdk`, `common`, `compiler`, `core`, `forms`,
   `material`, `platform-browser`, `platform-server`, `router`, `service-worker` and
   `compiler-cli`. `@angular/build`, `cli` and `ssr` are versioned separately.
2. Delete the `node_modules/@angular/<pkg>` entries for those packages from `package-lock.json`.
3. Run a bare `npm install --package-lock-only`, then `npm ci --dry-run` to confirm.

A `dependabot.yml` group for `@angular/*` with `applies-to: security-updates` would prevent the
problem.

## Working in git worktrees

- A worktree has no `node_modules` of its own. Node still resolves up the directory tree, so
  `npm start` and `ng` work, but TypeScript's `@types` lookup does not, so every spec fails
  with `Cannot find name 'describe'` and the whole test build dies. In a fresh worktree:
  `ln -s <main checkout>/node_modules node_modules` (it is gitignored). Do not `npm install`
  inside such a worktree: it would write into the main checkout's tree. A branch that adds
  Capacitor plugins needs a real `npm ci` instead (see [ios.md](ios.md)).
- `.claude/launch.json` starts `npm start` from the main checkout even when a session works in
  a worktree, so the preview shows code without the worktree's changes (check with
  `lsof -p <pid> | grep cwd`). To preview a worktree, run `npm run build` there, serve
  `dist/bible-app/browser` with a small static server that falls back from a folder to its
  `index.html` and then to `index.csr.html` and proxies `/v1/*` to the production API, and
  unregister the service worker and clear caches before reloading a new build.
- `.claude/hooks/verify.sh` (the Claude Code `Stop` hook) does `cd "$CLAUDE_PROJECT_DIR"`, the
  main checkout. When the main checkout has uncommitted `src/` changes, a session in a clean
  worktree is told its changes failed. Compare the spec count with a run in the worktree and
  check `git -C <main checkout> status -- src`.

## Branches and pull requests

- Before opening a PR from a worktree, check what the branch is based on:
  `git fetch origin master && git log --oneline origin/master..HEAD` should list only your
  own commits. A worktree can be cut from the tip of an unmerged branch; the PR then carries
  all of that branch's commits and goes conflicting when it is squash-merged. Name the real
  base in the PR, or rebase with `git rebase --onto origin/master <old parent tip>`.
- Before pushing more commits to a PR branch, check it is still open
  (`gh pr view <n> --json state`). If it was squash-merged meanwhile, move the new commits to
  a fresh branch with `git rebase --onto origin/<base> <last merged commit>`, check
  `git diff <old tip> HEAD` is empty, and open a follow-up PR; leave the merged PR's
  description alone.
- To rebase a branch whose parent was squash-merged, use `rebase --onto <base> <old parent tip>`
  and drop the parent's own commits from the todo.
