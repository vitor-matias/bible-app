import type { CapacitorConfig } from "@capacitor/cli"

const config: CapacitorConfig = {
  appId: "org.capuchinhos.biblia",
  appName: "Bíblia Sagrada",
  webDir: "dist/bible-app/browser",
  server: {
    ...(process.env['CAPACITOR_SERVER_URL'] || process.env['NODE_ENV'] === "production"
      ? { url: process.env['CAPACITOR_SERVER_URL'] || "https://biblia.capuchinhos.org" }
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
