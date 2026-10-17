import { execFileSync } from "node:child_process"
import { createHash, sign } from "node:crypto"
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { join, resolve } from "node:path"

// Packages the native web bundle (npm run build && npm run cap:prune) as a
// signed live update, laid out as the server serves it:
//
//   dist/live-update/<platform>/<channel>/<bundleId>.zip
//   dist/live-update/<platform>/<channel>/manifest.json
//
// LIVE_UPDATE_SIGNING_KEY holds the PEM private key matching
// live-update-public.pem. See docs/live-updates.md.

const webDir = "dist/bible-app/capacitor"
const outDir = "dist/live-update"
const platforms = ["android", "ios"]

function fail(message) {
  console.error(message)
  process.exit(1)
}

function readChannel(file, pattern) {
  const match = readFileSync(file, "utf8").match(pattern)
  if (!match) fail(`No live-update channel found in ${file}.`)
  return match[1]
}

// A bundle may only reach apps built from the same native code, so both
// projects must agree on the channel they were built for.
const androidChannel = readChannel(
  "android/app/build.gradle",
  /"capawesome_live_update_default_channel",\s*"([^"]+)"/,
)
const iosChannel = readChannel(
  "ios/App/App/Info.plist",
  /<key>CapawesomeLiveUpdateDefaultChannel<\/key>\s*<string>([^<]+)<\/string>/,
)
if (androidChannel !== iosChannel) {
  fail(
    `Live-update channels differ: Android "${androidChannel}", iOS "${iosChannel}". ` +
      "Keep android/app/build.gradle and ios/App/App/Info.plist in step.",
  )
}
const channel = androidChannel

const buildInfoFile = join(webDir, "build-info.json")
if (!existsSync(buildInfoFile)) {
  fail(`${buildInfoFile} is missing. Run "npm run build && npm run cap:prune" first.`)
}
// The app compares this with its own build-info.json to only move forward.
const { buildVersion: bundleId } = JSON.parse(readFileSync(buildInfoFile, "utf8"))
if (!/^\d{8}-\d{6}Z$/.test(bundleId ?? "")) {
  fail(`Unexpected buildVersion "${bundleId}" in ${buildInfoFile}.`)
}

const privateKey = process.env.LIVE_UPDATE_SIGNING_KEY
if (!privateKey) fail("LIVE_UPDATE_SIGNING_KEY is not set.")

rmSync(outDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })
const zipFile = resolve(outDir, `${bundleId}.zip`)
// index.html at the zip root; -X drops extra file attributes.
execFileSync("zip", ["-qrX", zipFile, "."], { cwd: webDir, stdio: "inherit" })

const zip = readFileSync(zipFile)
const checksum = createHash("sha256").update(zip).digest("hex")
// SHA256withRSA over the zip, as the plugin verifies it.
const signature = sign("sha256", zip, privateKey).toString("base64")

// The zip's URL is relative to the manifest, so the app needs only the base.
const manifest = { bundleId, url: `${bundleId}.zip`, checksum, signature }
for (const platform of platforms) {
  const dir = join(outDir, platform, channel)
  mkdirSync(dir, { recursive: true })
  copyFileSync(zipFile, join(dir, `${bundleId}.zip`))
  writeFileSync(
    join(dir, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  )
}
rmSync(zipFile)

console.log(
  `Packaged live update ${bundleId} for channel ${channel} (${platforms.join(", ")}) in ${outDir}.`,
)
