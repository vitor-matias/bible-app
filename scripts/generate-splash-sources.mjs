import sharp from "sharp"

// Splash sources for `npm run cap:icons`. Without them @capacitor/assets
// sizes the splash logo from the icon, leaving it at ~20% of the screen width
// on Android and ~8% on iOS. A 2732x2732 source is crop-filled to every
// Android size and is the iOS launch image itself, so the logo lands at about
// a third of the screen width on phones. The icon is placed at its native
// 512px so it is never upscaled.
const SIZE = 2732
const ICON = "assets/icon.png"
// The app's --background-color, light and dark (src/styles.css).
const variants = [
  { file: "assets/splash.png", background: "#ffffff" },
  { file: "assets/splash-dark.png", background: "#121212" },
]

for (const { file, background } of variants) {
  await sharp({
    create: { width: SIZE, height: SIZE, channels: 4, background },
  })
    .composite([{ input: ICON, gravity: "center" }])
    .png()
    .toFile(file)
  console.log(`Wrote ${file}`)
}
