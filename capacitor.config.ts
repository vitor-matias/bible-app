import { readFileSync } from "node:fs"
import type { CapacitorConfig } from "@capacitor/cli"

const config: CapacitorConfig = {
  appId: "org.capuchinhos.biblia",
  appName: "Bíblia Sagrada",
  // Built by scripts/prune-prerender-for-capacitor.mjs (npm run cap:prune): a
  // copy of dist/bible-app/browser with the prerendered route pages stripped,
  // so the native bundle stays lean and the web build keeps its static HTML.
  webDir: "dist/bible-app/capacitor",
  server: {
    // The app ships the bundled webDir. Only for development, point the shell
    // at a dev server for live reload, e.g.
    //   CAPACITOR_LIVE_RELOAD_URL=http://192.168.1.10:4200 npx cap run android
    ...(process.env['CAPACITOR_LIVE_RELOAD_URL']
      ? { url: process.env['CAPACITOR_LIVE_RELOAD_URL'], cleartext: true }
      : {}),
    androidScheme: "https",
  },
  plugins: {
    LiveUpdate: {
      // Bundles must be signed with the matching private key (CI secret
      // LIVE_UPDATE_SIGNING_KEY); unsigned or tampered ones are rejected.
      publicKey: readFileSync("live-update-public.pem", "utf8").trim(),
      // Roll back to the bundled app if a new bundle never renders a page
      // (NativeShellService calls ready() after the first navigation).
      readyTimeout: 10000,
      autoBlockRolledBackBundles: true,
      autoDeleteBundles: true,
    },
    SplashScreen: {
      // NativeShellService hides it once the first page has rendered.
      launchAutoHide: false,
      backgroundColor: "#ffffff",
      showSpinner: false,
    },
    // Status/navigation bar icon styles are set at runtime (AppComponent and
    // ThemeService via SystemBars): the toolbar is always brown while the
    // navigation bar follows the in-app theme, which one static style cannot
    // express. The API sends CORS headers, so native HTTP patching is unneeded.
  },
}

export default config
