import type { CapacitorConfig } from "@capacitor/core"

const config: CapacitorConfig = {
  appId: "org.capuchinhos.biblia",
  appName: "Bíblia dos Capuchinhos",
  webDir: "dist/bible-app/browser",
  server: {
    ...(process.env['CAPACITOR_SERVER_URL'] || process.env['NODE_ENV'] === "production"
      ? { url: process.env['CAPACITOR_SERVER_URL'] || "https://bible-app-ten-psi.vercel.app/" }
      : {}),
    androidScheme: "https",
  },
  plugins: {
    StatusBar: {
      overlaysWebView: true,
      style: "DARK",
    },
  },
  android: {
    useHybridComposition: true,
  },
}

export default config
