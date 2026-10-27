import type {
  InstallBrowser,
  InstallPlatform,
} from "../../services/pwa-install.service"

export interface OnboardingFeature {
  icon: string
  text: string
  /** The iOS app's wording, where its native bars put things elsewhere. */
  iosText?: string
  /** The Android app's, where its Material bars differ from the iOS app's. */
  androidText?: string
}

export interface OnboardingStep {
  id: string
  icon: string
  /** Shown in the hero instead of the icon, e.g. the app logo on the welcome step. */
  image?: string
  title: string
  intro: string
  /** The iOS app's wording, where its native bars put things elsewhere. */
  iosIntro?: string
  /** The Android app's, where its Material bars differ from the iOS app's. */
  androidIntro?: string
  /** The Android app's icon, where it shows the button the intro names. */
  androidIcon?: string
  features: readonly OnboardingFeature[]
}

export interface InstallGuideStep {
  icon: string
  text: string
  /** Browser the step applies to, when a guide covers several. */
  label?: string
}

export interface InstallGuide {
  steps: readonly InstallGuideStep[]
  note?: string
}

/** A run of a step's text: words, or a browser button drawn as its icon. */
export type TextSegment =
  | { kind: "text"; text: string }
  | { kind: "icon"; icon: string; label: string }

/**
 * Browser buttons a step can show as their icon, written [[icon]] in its
 * text, with the name a screen reader says instead.
 */
const INLINE_ICONS: Readonly<Record<string, string>> = {
  ios_share: "Partilhar",
  menu: "menu",
}

const INLINE_ICON = /\[\[([a-z_]+)\]\]/g
const segmentCache = new Map<string, readonly TextSegment[]>()

/** Splits a step's text around its [[icon]] markers. */
export function textSegments(text: string): readonly TextSegment[] {
  const cached = segmentCache.get(text)
  if (cached) return cached
  const segments: TextSegment[] = []
  let last = 0
  for (const match of text.matchAll(INLINE_ICON)) {
    const icon = match[1]
    const label = INLINE_ICONS[icon]
    if (!label) continue
    if (match.index > last) {
      segments.push({ kind: "text", text: text.slice(last, match.index) })
    }
    segments.push({ kind: "icon", icon, label })
    last = match.index + match[0].length
  }
  if (last < text.length)
    segments.push({ kind: "text", text: text.slice(last) })
  segmentCache.set(text, segments)
  return segments
}

export interface PlatformOption {
  id: InstallPlatform
  icon: string
  label: string
}

export const INSTALL_STEP_ID = "install"

export const ONBOARDING_STEPS: readonly OnboardingStep[] = [
  {
    id: "welcome",
    icon: "menu_book",
    image: "icons/512X512_REDONDO.png",
    title: "Bem-vindo à Bíblia Sagrada",
    intro:
      "A Bíblia Sagrada, traduzida pela Difusora Bíblica, sempre consigo: no telemóvel, no tablet e no computador, mesmo sem ligação à internet.",
    features: [
      {
        icon: "cloud_off",
        text: "Depois de instalar, abra a app uma vez com ligação: os capítulos ficam guardados no dispositivo e pode voltar a lê-los sem ligação.",
      },
      {
        icon: "history",
        text: "Ao abrir a app, volta ao livro e capítulo onde ficou.",
      },
      {
        icon: "touch_app",
        text: "Esta introdução demora menos de um minuto. Pode voltar a vê-la em qualquer altura a partir do menu.",
        androidText:
          "Esta introdução demora menos de um minuto. Pode voltar a vê-la em qualquer altura no menu ⋮, em «Como usar a app».",
      },
    ],
  },
  {
    id: "navigate",
    icon: "explore",
    title: "Navegar na Bíblia",
    intro:
      "No topo do ecrã, toque no nome do livro para escolher outro livro e no número para saltar para um capítulo.",
    iosIntro:
      "Na barra inferior, toque no nome do livro para escolher outro livro ou capítulo.",
    androidIntro:
      "No topo do ecrã, toque no livro e capítulo (por exemplo, «Génesis 1 ▾») para escolher outra passagem.",
    features: [
      {
        icon: "swipe",
        text: "Deslize o texto para o lado para mudar de capítulo. No computador, use as setas ← e → ou os botões nas margens.",
        iosText:
          "Deslize o texto para o lado, ou toque nas setas ‹ › da barra inferior, para mudar de capítulo.",
        androidText:
          "Deslize o texto para o lado, ou toque nas setas ‹ › dos cantos inferiores, para mudar de capítulo.",
      },
      {
        icon: "link",
        text: "As referências no texto e nas notas (por exemplo, Jo 3,16) são ligações: toque para abrir a passagem.",
      },
      {
        icon: "notes",
        text: "Toque num versículo com nota para ler a nota de rodapé.",
        iosText:
          "Toque no ícone de notas junto ao número do versículo para ler a nota. Um toque no texto mostra ou esconde os botões.",
        androidText:
          "Toque no ícone de notas junto ao número do versículo para ler a nota. Os botões saem do caminho enquanto lê e voltam quando desliza para cima.",
      },
    ],
  },
  {
    id: "customize",
    icon: "tune",
    title: "Ler à sua maneira",
    intro:
      "Abra o menu ☰ no canto superior esquerdo para ajustar a leitura ao seu gosto.",
    iosIntro:
      "Toque em AA, no topo à esquerda, para ajustar a leitura ao seu gosto.",
    // TT is the button's glyph, as AA is iOS's; TalkBack users hear its name.
    androidIntro:
      "Toque em TT (Texto e aparência), no topo à direita, para ajustar a leitura ao seu gosto.",
    androidIcon: "format_size",
    features: [
      {
        icon: "dark_mode",
        text: "Tema claro, escuro ou automático, seguindo o sistema.",
      },
      {
        icon: "auto_stories",
        text: "Alterne entre o texto contínuo e a leitura página a página, como num livro.",
      },
      {
        icon: "text_increase",
        text: "Aumente ou diminua o tamanho da letra, ou faça o gesto de pinça sobre o texto.",
      },
      {
        icon: "arrow_circle_down",
        text: "Ative o deslocamento automático para ler sem mãos, com velocidade ajustável.",
        iosText:
          "Ative o deslocamento automático no menu ⋯ para ler sem mãos, com velocidade ajustável.",
        androidText:
          "Ative o deslocamento automático no menu ⋮, no topo à direita, para ler sem mãos, com velocidade ajustável.",
      },
    ],
  },
  {
    id: "tools",
    icon: "search",
    title: "Pesquisar, marcar e partilhar",
    intro:
      "Encontre passagens, volte facilmente aos capítulos preferidos e partilhe a Palavra.",
    features: [
      {
        icon: "search",
        text: "Toque na lupa para pesquisar palavras ou frases em toda a Bíblia.",
      },
      {
        icon: "bookmarks",
        text: "Guarde marcadores coloridos nos capítulos a que quer voltar.",
        iosText:
          "Toque no marcador, no topo à direita, para guardar marcadores coloridos nos capítulos a que quer voltar.",
      },
      {
        icon: "share",
        text: "Partilhe a passagem que está a ler com um toque, a partir do menu.",
      },
    ],
  },
  {
    id: INSTALL_STEP_ID,
    icon: "install_mobile",
    title: "Instalar a aplicação",
    intro:
      "Instale a Bíblia no seu dispositivo para a abrir a partir do ecrã principal, em ecrã inteiro e sem depender do navegador.",
    features: [],
  },
]

export const PLATFORM_OPTIONS: readonly PlatformOption[] = [
  { id: "android", icon: "android", label: "Android" },
  { id: "ios", icon: "phone_iphone", label: "iPhone / iPad" },
  { id: "desktop", icon: "computer", label: "Computador" },
]

const CONFIRM_MOBILE: InstallGuideStep = {
  icon: "check_circle",
  text: "Confirme em «Instalar». O ícone da Bíblia aparece no ecrã principal.",
}

// Chrome's menu item has been «Instale e crie um atalho» since mid-2026;
// earlier versions say «Instalar aplicação» or «Adicionar ao ecrã principal».
// Either way it then offers «Instalar» or «Criar atalho», and a shortcut only
// opens the page in Chrome.
const ANDROID_CHROME: InstallGuide = {
  steps: [
    {
      icon: "more_vert",
      text: "Toque no menu ⋮ do Chrome, no canto superior direito.",
    },
    {
      icon: "install_mobile",
      text: "Escolha «Instale e crie um atalho» (em versões anteriores, «Instalar aplicação» ou «Adicionar ao ecrã principal»).",
    },
    {
      icon: "check_circle",
      text: "Escolha «Instalar», não «Criar atalho». O ícone da Bíblia aparece no ecrã principal.",
    },
  ],
}

/** Unknown or less common Android browser: say which browser the steps assume. */
const ANDROID_GENERIC: InstallGuide = {
  steps: ANDROID_CHROME.steps,
  note: "Estes passos são do Chrome, o navegador habitual no Android. No Samsung Internet, Firefox ou Edge, procure «Instalar» ou «Adicionar página a» no menu do navegador.",
}

const ANDROID_FIREFOX: InstallGuide = {
  steps: [
    { icon: "more_vert", text: "Toque no menu ⋮ do Firefox." },
    {
      icon: "install_mobile",
      text: "Escolha «Instalar» ou «Adicionar ao ecrã principal».",
    },
    CONFIRM_MOBILE,
  ],
}

const ANDROID_EDGE: InstallGuide = {
  steps: [
    {
      icon: "more_horiz",
      text: "Toque no menu ⋯ do Edge, na barra inferior.",
    },
    { icon: "install_mobile", text: "Escolha «Adicionar ao telefone»." },
    CONFIRM_MOBILE,
  ],
}

// Since iOS 26 the iPhone's Safari keeps Share in the ≡ menu of the address
// bar, unless the tabs are laid out at the bottom or top, which (like older
// iOS and the iPad) still show a Share button. The share sheet may hide
// «Adicionar ao ecrã principal» behind «Ver mais», and only iOS 26 or later
// offers «Abrir como aplicação web».
const IOS_SAFARI: InstallGuide = {
  steps: [
    {
      icon: "menu",
      text: "Na barra de endereço do Safari, toque em [[menu]] e depois em «Partilhar». Se vir [[ios_share]] na barra do Safari, toque diretamente nesse botão.",
    },
    {
      icon: "add_box",
      text: "Desça na lista e escolha «Adicionar ao ecrã principal» (se não a vir, toque em «Ver mais»).",
    },
    {
      icon: "check_circle",
      text: "Se aparecer a opção «Abrir como aplicação web», confirme que está ligada. Toque em «Adicionar», no canto superior direito.",
    },
  ],
  note: "No iPad, toque diretamente em [[ios_share]], no canto superior direito do Safari.",
}

const IOS_OTHER: InstallGuide = {
  steps: [
    {
      icon: "ios_share",
      text: "Toque em [[ios_share]] (Partilhar) no navegador.",
    },
    {
      icon: "add_box",
      text: "Escolha «Adicionar ao ecrã principal», tocando em «Ver mais» se não a vir (disponível a partir do iOS 16.4).",
    },
    { icon: "check_circle", text: "Toque em «Adicionar»." },
  ],
  note: "Se não encontrar a opção, abra biblia.capuchinhos.org no Safari e siga os mesmos passos.",
}

type DesktopBrowser = Exclude<InstallBrowser, "other">

const DESKTOP_BROWSER_ORDER: readonly DesktopBrowser[] = [
  "chrome",
  "edge",
  "safari",
  "firefox",
]

const DESKTOP_BROWSER_STEPS: Record<DesktopBrowser, InstallGuideStep> = {
  chrome: {
    label: "Chrome",
    icon: "install_desktop",
    text: "Clique no ícone de instalação, no lado direito da barra de endereço, ou abra o menu ⋮ → «Transmitir, guardar e partilhar» → «Instalar página como app…».",
  },
  edge: {
    label: "Edge",
    icon: "install_desktop",
    text: "Clique no ícone de instalação na barra de endereço, ou abra o menu ⋯ («Definições e muito mais») → «Aplicações» → «Instale este site como uma aplicação». Em algumas versões, «Aplicações» está dentro de «Mais ferramentas».",
  },
  safari: {
    label: "Safari (macOS 14 ou superior)",
    icon: "ios_share",
    text: "Clique em [[ios_share]] (ou no menu Ficheiro) e escolha «Adicionar à Dock».",
  },
  // Web apps arrived in Firefox 143 for Windows only (150 for the Microsoft
  // Store build); macOS and Linux still have none. The address-bar button
  // installs at once, without asking.
  firefox: {
    label: "Firefox",
    icon: "install_desktop",
    text: "No Windows (Firefox 143 ou superior; 150 ou superior se o instalou a partir da Microsoft Store), clique no botão de aplicações web, na barra de endereço, para fixar a Bíblia na barra de tarefas. No macOS e no Linux, o Firefox não instala aplicações web: use o Chrome, o Edge ou o Safari, ou continue a ler no Firefox, incluindo sem ligação.",
  },
}

// Firefox installs without a confirmation, so this one is conditional.
const CONFIRM_DESKTOP: InstallGuideStep = {
  icon: "check_circle",
  text: "Se o navegador pedir, confirme em «Instalar» (ou «Adicionar»). A Bíblia passa a abrir numa janela própria, como qualquer outra aplicação.",
}

/** Desktop users often have several browsers, so list them all, theirs first. */
function desktopGuide(browser: InstallBrowser | null): InstallGuide {
  const detected = DESKTOP_BROWSER_ORDER.find((b) => b === browser)
  const order = detected
    ? [detected, ...DESKTOP_BROWSER_ORDER.filter((b) => b !== detected)]
    : DESKTOP_BROWSER_ORDER
  return {
    steps: [...order.map((b) => DESKTOP_BROWSER_STEPS[b]), CONFIRM_DESKTOP],
  }
}

/**
 * Picks the install instructions for a platform. `browser` is the detected
 * browser when the platform is the one the user is actually on, or `null`
 * when they are browsing instructions for another device.
 */
export function getInstallGuide(
  platform: InstallPlatform,
  browser: InstallBrowser | null,
): InstallGuide {
  switch (platform) {
    case "android":
      if (browser === "chrome") return ANDROID_CHROME
      if (browser === "firefox") return ANDROID_FIREFOX
      if (browser === "edge") return ANDROID_EDGE
      return ANDROID_GENERIC
    case "ios":
      return browser === null || browser === "safari" ? IOS_SAFARI : IOS_OTHER
    default:
      return desktopGuide(browser)
  }
}

/**
 * One page of the native apps' onboarding: the iOS app's sheet
 * (OnboardingSheet.swift), the Android app's dialog (Dialogs.kt).
 */
export interface NativeOnboardingStep {
  id: string
  title: string
  intro: string
  /** SF Symbol for the page's hero on iOS, unless it shows the app's logo. */
  symbol: string
  /** The Material Symbol, which the Android app shows. */
  icon: string
  logo: boolean
  features: { symbol: string; icon: string; text: string }[]
}

/** SF Symbols standing in for the Material icons on iOS. */
const SF_SYMBOLS: Readonly<Record<string, string>> = {
  menu_book: "book",
  cloud_off: "icloud.slash",
  history: "clock.arrow.circlepath",
  touch_app: "hand.tap",
  explore: "safari",
  swipe: "hand.draw",
  link: "link",
  notes: "note.text",
  tune: "slider.horizontal.3",
  dark_mode: "circle.lefthalf.filled",
  auto_stories: "book.pages",
  text_increase: "textformat.size",
  arrow_circle_down: "arrow.down.circle",
  search: "magnifyingglass",
  bookmarks: "bookmark",
  share: "square.and.arrow.up",
}

export function sfSymbol(icon: string): string {
  return SF_SYMBOLS[icon] ?? "circle"
}

/**
 * The steps as the native apps show them: in their own words, and without
 * the install step (the app is installed by definition). The Android app's
 * Material bars put the passage on top and the chapter arrows in the corners;
 * where it says nothing of its own, it reads as the iOS app.
 */
export function nativeOnboardingSteps(
  steps: readonly OnboardingStep[] = ONBOARDING_STEPS,
  platform: "ios" | "android" = "ios",
): NativeOnboardingStep[] {
  const android = platform === "android"
  return steps
    .filter((step) => step.id !== INSTALL_STEP_ID)
    .map((step) => ({
      id: step.id,
      title: step.title,
      intro:
        (android ? step.androidIntro : undefined) ??
        step.iosIntro ??
        step.intro,
      symbol: sfSymbol(step.icon),
      icon: (android ? step.androidIcon : undefined) ?? step.icon,
      logo: !!step.image,
      features: step.features.map((feature) => ({
        symbol: sfSymbol(feature.icon),
        icon: feature.icon,
        text:
          (android ? feature.androidText : undefined) ??
          feature.iosText ??
          feature.text,
      })),
    }))
}
