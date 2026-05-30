#!/usr/bin/env bash
# Stop hook: before an agent finishes a turn, if there are uncommitted changes
# under src/, run lint + typecheck + unit tests. If any fail, block the stop
# (exit 2) and surface the failing output so the agent fixes it before stopping.
# No src/ changes => exit 0 immediately (skips pure Q&A turns).
set -uo pipefail

cd "${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null)}" 2>/dev/null || exit 0

# Nothing to verify if src/ has no pending changes.
if [ -z "$(git status --porcelain -- src 2>/dev/null)" ]; then
  exit 0
fi

report=""
failed=0

check() {
  local name="$1"
  shift
  local output
  if ! output="$("$@" 2>&1)"; then
    failed=1
    report="${report}
=== ${name} FAILED (${*}) ===
${output}
"
  fi
}

check "Biome lint" npx @biomejs/biome check ./src
check "TypeScript typecheck" npx tsc -p tsconfig.app.json --noEmit
check "Unit tests" npx ng test --watch=false --browsers=ChromeHeadlessNoSandbox

if [ "$failed" -eq 1 ]; then
  {
    echo "Pre-stop verification failed. Fix the following before finishing this turn:"
    echo "$report"
  } >&2
  exit 2
fi

exit 0
