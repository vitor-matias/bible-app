import type { CapacitorConfig } from "@capacitor/cli"

const config: CapacitorConfig = {
  appId: "org.capuchinhos.biblia",
  appName: "Bíblia Sagrada",
  // Built by scripts/prune-prerender-for-capacitor.mjs (npm run cap:prune): a
  // copy of dist/bible-app/browser with the prerendered route pages stripped,
  // so the native bundle stays lean and the web build keeps its static HTML.
  webDir: "dist/bible-app/capacitor",
  server: {
    ...(process.env['CAPACITOR_SERVER_URL'] || process.env['NODE_ENV'] === "production"
      ? { url: process.env['CAPACITOR_SERVER_URL'] || "https://biblia.capuchinhos.org/" }
      : { url: "http://localhost:4200" }),
    androidScheme: "https",
    iosScheme: "https",
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
