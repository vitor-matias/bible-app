import type {
  InstallBrowser,
  InstallPlatform,
} from "../../services/pwa-install.service"

export interface OnboardingFeature {
  icon: string
  text: string
}

export interface OnboardingStep {
  id: string
  icon: string
  title: string
  intro: string
  features: readonly OnboardingFeature[]
}

export interface InstallGuideStep {
  icon: string
  text: string
}

export interface InstallGuide {
  steps: readonly InstallGuideStep[]
  note?: string
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
    title: "Bem-vindo à Bíblia dos Capuchinhos",
    intro:
      "A Bíblia Sagrada da Difusora Bíblica, sempre consigo: no telemóvel, no tablet e no computador, mesmo sem ligação à internet.",
    features: [
      {
        icon: "cloud_off",
        text: "Os capítulos que lê ficam guardados no dispositivo e podem ser lidos sem ligação.",
      },
      {
        icon: "history",
        text: "Ao abrir a aplicação, volta ao livro e capítulo onde ficou.",
      },
      {
        icon: "touch_app",
        text: "Esta introdução demora menos de um minuto. Pode voltar a vê-la em qualquer altura a partir do menu.",
      },
    ],
  },
  {
    id: "navigate",
    icon: "explore",
    title: "Navegar na Bíblia",
    intro:
      "No topo do ecrã, toque no nome do livro para escolher outro livro e no número para saltar para um capítulo.",
    features: [
      {
        icon: "swipe",
        text: "Deslize o texto para o lado para mudar de capítulo. No computador, use as setas ← e → ou os botões nas margens.",
      },
      {
        icon: "link",
        text: "As referências no texto e nas notas (por exemplo, Jo 3,16) são ligações: toque para abrir a passagem.",
      },
      {
        icon: "notes",
        text: "Toque num versículo com nota para ler a nota de rodapé.",
      },
    ],
  },
  {
    id: "customize",
    icon: "tune",
    title: "Ler à sua maneira",
    intro:
      "Abra o menu ☰ no canto superior esquerdo para ajustar a leitura ao seu gosto.",
    features: [
      {
        icon: "dark_mode",
        text: "Tema claro, escuro ou automático, seguindo o sistema.",
      },
      {
        icon: "auto_stories",
        text: "Alterne entre o deslocamento contínuo e o modo de páginas, como num livro.",
      },
      {
        icon: "text_increase",
        text: "Aumente ou diminua o tamanho da letra, ou faça o gesto de pinça sobre o texto.",
      },
      {
        icon: "auto_mode",
        text: "Ative o deslocamento automático para ler sem mãos, com velocidade ajustável.",
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

const CONFIRM_DESKTOP: InstallGuideStep = {
  icon: "check_circle",
  text: "Confirme em «Instalar». A Bíblia passa a abrir numa janela própria, como qualquer outra aplicação.",
}

const ANDROID_CHROME: InstallGuide = {
  steps: [
    {
      icon: "more_vert",
      text: "Toque no menu ⋮ do navegador, no canto superior direito.",
    },
    {
      icon: "install_mobile",
      text: "Escolha «Instalar aplicação» ou «Adicionar ao ecrã principal».",
    },
    CONFIRM_MOBILE,
  ],
  note: "No Samsung Internet, Firefox ou Edge, procure «Instalar» ou «Adicionar página a» no menu do navegador.",
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

const IOS_SAFARI: InstallGuide = {
  steps: [
    {
      icon: "ios_share",
      text: "Toque no botão Partilhar (o quadrado com uma seta para cima), na barra do Safari.",
    },
    {
      icon: "add_box",
      text: "Deslize as opções para baixo e escolha «Adicionar ao ecrã principal».",
    },
    {
      icon: "check_circle",
      text: "Toque em «Adicionar», no canto superior direito.",
    },
  ],
  note: "No iPad, o botão Partilhar fica no topo, junto à barra de endereço.",
}

const IOS_OTHER: InstallGuide = {
  steps: [
    { icon: "ios_share", text: "Toque no botão Partilhar do navegador." },
    {
      icon: "add_box",
      text: "Escolha «Adicionar ao ecrã principal» (disponível a partir do iOS 16.4).",
    },
    { icon: "check_circle", text: "Toque em «Adicionar»." },
  ],
  note: "Se não encontrar a opção, abra biblia.capuchinhos.org no Safari e siga os mesmos passos.",
}

const DESKTOP_CHROME: InstallGuide = {
  steps: [
    {
      icon: "install_desktop",
      text: "Clique no ícone de instalação, no lado direito da barra de endereço.",
    },
    {
      icon: "more_vert",
      text: "Ou abra o menu ⋮ → «Transmitir, guardar e partilhar» → «Instalar página como aplicação…».",
    },
    CONFIRM_DESKTOP,
  ],
}

const DESKTOP_GENERIC: InstallGuide = {
  steps: DESKTOP_CHROME.steps,
  note: "No Safari (macOS): menu Ficheiro → «Adicionar à Dock». O Firefox não suporta a instalação de aplicações web.",
}

const DESKTOP_EDGE: InstallGuide = {
  steps: [
    {
      icon: "install_desktop",
      text: "Clique no ícone de instalação, no lado direito da barra de endereço.",
    },
    {
      icon: "more_horiz",
      text: "Ou abra o menu ⋯ → «Aplicações» → «Instalar este site como uma aplicação».",
    },
    CONFIRM_DESKTOP,
  ],
}

const DESKTOP_SAFARI: InstallGuide = {
  steps: [
    {
      icon: "ios_share",
      text: "Clique no botão Partilhar do Safari (ou no menu Ficheiro) e escolha «Adicionar à Dock».",
    },
    {
      icon: "check_circle",
      text: "Confirme em «Adicionar». A Bíblia fica na Dock e no Launchpad.",
    },
  ],
  note: "Requer macOS Sonoma (14) ou superior.",
}

const DESKTOP_FIREFOX: InstallGuide = {
  steps: [
    {
      icon: "info",
      text: "O Firefox não suporta a instalação de aplicações web no computador.",
    },
    {
      icon: "open_in_browser",
      text: "Pode continuar a ler no Firefox, incluindo sem ligação, ou instalar a aplicação a partir do Chrome, Edge ou Safari.",
    },
  ],
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
      if (browser === "firefox") return ANDROID_FIREFOX
      if (browser === "edge") return ANDROID_EDGE
      return ANDROID_CHROME
    case "ios":
      return browser === null || browser === "safari" ? IOS_SAFARI : IOS_OTHER
    default:
      if (browser === "chrome") return DESKTOP_CHROME
      if (browser === "edge") return DESKTOP_EDGE
      if (browser === "safari") return DESKTOP_SAFARI
      if (browser === "firefox") return DESKTOP_FIREFOX
      return DESKTOP_GENERIC
  }
}
