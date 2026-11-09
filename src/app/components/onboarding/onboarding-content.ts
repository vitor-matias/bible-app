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
  /** For the website: the native apps do not have what it describes. */
  webOnly?: boolean
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
  /**
   * The button the step names, ringed while the step shows: the passage,
   * search, or where the text settings are (the web's menu, the apps' text
   * button). On the web, the header button with this `data-tour`.
   */
  highlight?: "passage" | "search" | "text"
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

/** Splits a step's text around its [[icon]] markers. */
export function textSegments(text: string): readonly TextSegment[] {
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
  return segments
}

export interface PlatformOption {
  id: InstallPlatform
  icon: string
  label: string
}

export const INSTALL_STEP_ID = "install"

// Written for someone who has never used the app: one job per step, the
// control named as it is announced, its glyph only alongside the name.
export const ONBOARDING_STEPS: readonly OnboardingStep[] = [
  {
    id: "welcome",
    icon: "menu_book",
    image: "icons/512X512_REDONDO.png",
    title: "Bem-vindo à Bíblia Sagrada",
    intro:
      "A Bíblia Sagrada, traduzida pela Difusora Bíblica, sempre consigo: no telemóvel, no tablet e no computador.",
    features: [
      {
        icon: "explore",
        text: "Nos próximos passos: como escolher um livro, encontrar uma passagem e aumentar a letra.",
      },
      {
        icon: "history",
        text: "Ao abrir a app, volta ao livro e capítulo onde ficou.",
      },
      {
        icon: "touch_app",
        text: "Pode voltar a ver esta introdução em «Menu» (☰), em «Como usar a app».",
        iosText:
          "Pode voltar a ver esta introdução no menu «Mais» (⋯), em «Como usar a app».",
        androidText:
          "Pode voltar a ver esta introdução no menu «Mais opções» (⋮), em «Como usar a app».",
      },
    ],
  },
  // The web header has the book and the chapter as two buttons; the apps have
  // one, whose picker opens on the current book's chapters, «Livros» a step back.
  {
    id: "books",
    icon: "menu_book",
    highlight: "passage",
    title: "Escolher um livro",
    intro:
      "No topo do ecrã, toque no nome do livro (por exemplo, «Génesis») e escolha outro na lista, como no índice da sua Bíblia.",
    iosIntro:
      "Na barra inferior, toque no livro e capítulo (por exemplo, «Génesis 1»). Aparecem os capítulos desse livro: toque em «Livros» para escolher outro livro.",
    androidIntro:
      "No topo do ecrã, toque no livro e capítulo (por exemplo, «Génesis 1»). Aparecem os capítulos desse livro: toque em «Livros» para escolher outro livro.",
    features: [
      {
        icon: "touch_app",
        text: "Para mudar de capítulo, toque no número ao lado do nome do livro.",
        iosText: "Para mudar de capítulo, toque no número do capítulo.",
        androidText: "Para mudar de capítulo, toque no número do capítulo.",
      },
      {
        icon: "swipe",
        text: "Para ler o capítulo seguinte, deslize o texto para o lado. No computador, use as setas ← e → do teclado.",
        iosText: "Para ler o capítulo seguinte, deslize o texto para o lado.",
        androidText:
          "Para ler o capítulo seguinte, deslize o texto para o lado.",
      },
      {
        icon: "search",
        text: "Não encontra o livro? Escreva parte do nome em «Filtrar livros»: «cor» mostra as cartas aos Coríntios.",
      },
    ],
  },
  // Readers meet the Bible as a reference read out at Mass, and search opens
  // one directly.
  {
    id: "tools",
    icon: "search",
    highlight: "search",
    title: "Encontrar uma passagem",
    intro:
      "Ouviu uma leitura na Missa, por exemplo «Jo 3,16»? Toque em «Pesquisar» (a lupa), no topo, e escreva a referência: a app abre logo o versículo.",
    features: [
      {
        icon: "search",
        text: "Também pode procurar palavras ou frases em toda a Bíblia, por exemplo «bom pastor».",
      },
      // The web menu offers it only where the browser can share (Web Share).
      {
        icon: "share",
        text: "No telemóvel e no tablet, para enviar a passagem a alguém, use «Partilhar» em «Menu» (☰).",
        iosText:
          "Para enviar a passagem a alguém, use «Partilhar» no menu «Mais» (⋯).",
        androidText:
          "Para enviar a passagem a alguém, use «Partilhar» no menu «Mais opções» (⋮).",
      },
      {
        icon: "bookmarks",
        text: "Para voltar a um capítulo, guarde um marcador em «Menu» (☰), em «Marcadores».",
        iosText:
          "Para voltar a um capítulo, guarde um marcador em «Marcadores», no topo.",
        androidText:
          "Para voltar a um capítulo, guarde um marcador em «Marcadores», no topo.",
      },
    ],
  },
  {
    id: "customize",
    icon: "text_increase",
    highlight: "text",
    title: "Letra maior",
    intro:
      "Toque em «Menu» (☰), no canto superior esquerdo, para aumentar a letra e escolher o tema claro ou escuro.",
    iosIntro:
      "Toque em «Texto e aparência» (AA), no topo, para aumentar a letra e escolher o tema claro ou escuro.",
    androidIntro:
      "Toque em «Texto e aparência» (TT), no topo, para aumentar a letra e escolher o tema claro ou escuro.",
    androidIcon: "format_size",
    features: [
      {
        icon: "touch_app",
        text: "Também pode afastar ou aproximar dois dedos sobre o texto para mudar o tamanho da letra.",
      },
      {
        icon: "dark_mode",
        text: "O tema escuro cansa menos a vista à noite. «Automático» segue o seu dispositivo.",
      },
      {
        icon: "auto_stories",
        text: "Leia em texto contínuo ou página a página, como num livro.",
      },
      {
        icon: "view_sidebar",
        text: "No computador, num ecrã largo, o Modo de estudo (menu ☰) põe ao lado do texto as referências, as notas de rodapé, as suas notas e a pesquisa. Clique no número de um versículo para o marcar, copiar ou escrever uma nota.",
        webOnly: true,
      },
    ],
  },
  {
    id: INSTALL_STEP_ID,
    icon: "install_mobile",
    title: "Instalar a aplicação",
    intro:
      "Instale a Bíblia no seu dispositivo para a abrir a partir do ecrã principal, em ecrã inteiro e sem depender do navegador. Abra-a uma vez com ligação à internet: depois pode ler sem ligação.",
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
  /** The bar button the page names (OnboardingStep.highlight). */
  highlight?: OnboardingStep["highlight"]
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
  view_sidebar: "sidebar.right",
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
      highlight: step.highlight,
      features: step.features
        .filter((feature) => !feature.webOnly)
        .map((feature) => ({
          symbol: sfSymbol(feature.icon),
          icon: feature.icon,
          text:
            (android ? feature.androidText : undefined) ??
            feature.iosText ??
            feature.text,
        })),
    }))
}
