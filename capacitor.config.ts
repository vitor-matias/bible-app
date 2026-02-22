import type { CapacitorConfig } from "@capacitor/core"

const config: CapacitorConfig = {
  appId: "org.capuchinhos.biblia",
  appName: "Bíblia dos Capuchinhos",
  webDir: "dist/bible-app/browser",
  server: {
    url: "https://biblia.capuchinhos.org",
    cleartext: true,
    androidScheme: "https",
  },
  plugins: {
    StatusBar: {
      overlaysWebView: true,
      style: "DARK",
    },
  },
  android: {
    allowMixedContent: true,
    useHybridComposition: true,
  },
}

export default config
