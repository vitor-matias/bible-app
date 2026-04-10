import { writeFileSync, mkdirSync, existsSync } from "node:fs"
import { join } from "node:path"

function pad(value) {
  return String(value).padStart(2, "0")
}

function utcTimestamp() {
  const now = new Date()
  const yyyy = now.getUTCFullYear()
  const mm = pad(now.getUTCMonth() + 1)
  const dd = pad(now.getUTCDate())
  const hh = pad(now.getUTCHours())
  const min = pad(now.getUTCMinutes())
  const ss = pad(now.getUTCSeconds())

  return `${yyyy}${mm}${dd}-${hh}${min}${ss}Z`
}

function resolveBuildEnvironment() {
  if (process.env.VERCEL || process.env.VERCEL_ENV || process.env.NOW_BUILDER) {
    return "vercel"
  }

  if (process.env.GITHUB_ACTIONS === "true" || process.env.GITHUB_WORKFLOW) {
    return "github"
  }

  return "manual"
}

const buildVersion = utcTimestamp()
const buildEnvironment = resolveBuildEnvironment()

// Target the production build output directory
const distPath = "dist/bible-app/browser"
const filePath = join(distPath, "build-info.json")

try {
  if (!existsSync(distPath)) {
    mkdirSync(distPath, { recursive: true })
  }

  writeFileSync(
    filePath,
    `${JSON.stringify({ buildVersion, buildEnvironment }, null, 2)}\n`,
    "utf8",
  )
  console.log(
    `Build info written to ${filePath}: buildVersion=${buildVersion}, buildEnvironment=${buildEnvironment}`,
  )
} catch (error) {
  console.error("Failed to write build-info.json:", error)
  process.exit(1)
}
