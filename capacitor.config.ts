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
    StatusBar: {
      overlaysWebView: true,
      style: "DARK",
    },
    CapacitorHttp: {
      enabled: true,
    },
  },
  android: {},
}

export default config
