import type { CapacitorConfig } from "@capacitor/core"

const config: CapacitorConfig = {
  appId: "org.capuchinhos.biblia",
  appName: "Bíblia dos Capuchinhos",
  webDir: "dist/bible-app/browser",
  server: {
    url: "https://bible-app-ten-psi.vercel.app/",
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
