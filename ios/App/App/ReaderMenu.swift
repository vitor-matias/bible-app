import UIKit

/// The reader's two menus: the text button's and ⋯. Between them, what the
/// web header's Material menu holds, but Marcadores, which has its own button.
enum ReaderMenu {
    private static func action(_ title: String, _ symbol: String, _ id: String, keepsOpen: Bool = false,
                               send: @escaping (String) -> Void) -> UIAction {
        let action = UIAction(title: title, image: UIImage(systemName: symbol)) { _ in send(id) }
        if keepsOpen, #available(iOS 16.0, *) {
            action.attributes.insert(.keepsMenuPresented)
        }
        return action
    }

    /// The small print at the end of the menu, on one line: "1.2.3 ·
    /// 20261016-120000Z", the release number CI sets from the release tag
    /// (MARKETING_VERSION), then the web bundle's id, when it was compiled. A
    /// menu's only small text is an item's subtitle, so it is an untitled item
    /// with nothing to do, which it dims. It gets a section of its own: among
    /// items with icons it would be indented to their titles, and wrap.
    private static func versionSection(buildVersion: String?) -> UIMenu? {
        var parts: [String] = []
        let key = "CFBundleShortVersionString"
        if let release = Bundle.main.object(forInfoDictionaryKey: key) as? String, !release.isEmpty {
            parts.append(release)
        }
        if let buildVersion, !buildVersion.isEmpty {
            parts.append(buildVersion)
        }
        guard !parts.isEmpty else { return nil }
        let item = UIAction(title: "", subtitle: parts.joined(separator: " · "), attributes: .disabled) { _ in }
        return UIMenu(options: .displayInline, children: [item])
    }

    /// Choices side by side, rather than a menu within the menu.
    private static func row(_ children: [UIMenuElement]) -> UIMenu {
        let row = UIMenu(title: "", options: .displayInline, children: children)
        if #available(iOS 16.0, *) {
            row.preferredElementSize = .medium
        }
        return row
    }

    /// Text size, theme, and pages or scrolling. Kept open throughout: the
    /// page changes behind it as people tap.
    static func font(_ state: ChromeState, send: @escaping (String) -> Void) -> UIMenu {
        let size = row([
            action("Diminuir texto", "textformat.size.smaller", "font-decrease", keepsOpen: true, send: send),
            action("Aumentar texto", "textformat.size.larger", "font-increase", keepsOpen: true, send: send),
        ])

        // The theme: its three choices, the current one marked.
        let themes = [("system", "Automático", "circle.lefthalf.filled"),
                      ("light", "Claro", "sun.max"),
                      ("dark", "Escuro", "moon")]
        let theme = row(themes.map { mode, title, symbol in
            let choice = action(title, symbol, "theme-\(mode)", keepsOpen: true, send: send)
            choice.state = mode == state.themeMode ? .on : .off
            return choice
        })

        var sections = [size, theme]
        // Pages or scrolling, the current one marked; the web app toggles.
        if let viewMode = state.viewMode {
            let modes = [("paged", "Página a página", "book"),
                         ("scrolling", "Texto contínuo", "arrow.up.and.down.text.horizontal")]
            sections.append(row(modes.map { mode, title, symbol in
                let choice = UIAction(title: title, image: UIImage(systemName: symbol)) { _ in
                    if mode != viewMode { send("view-mode") }
                }
                if #available(iOS 16.0, *) {
                    choice.attributes.insert(.keepsMenuPresented)
                }
                choice.state = mode == viewMode ? .on : .off
                return choice
            }))
        }
        // Justified or ragged-right, the current one marked; the web app toggles.
        if let raggedText = state.raggedText {
            let alignments = [(false, "Justificado", "text.justify"),
                              (true, "Alinhado à esquerda", "text.alignleft")]
            sections.append(row(alignments.map { ragged, title, symbol in
                let choice = UIAction(title: title, image: UIImage(systemName: symbol)) { _ in
                    if ragged != raggedText { send("text-align") }
                }
                if #available(iOS 16.0, *) {
                    choice.attributes.insert(.keepsMenuPresented)
                }
                choice.state = ragged == raggedText ? .on : .off
                return choice
            }))
        }
        return UIMenu(title: "Texto e aparência", children: sections)
    }

    /// Builds the reader's more menu, with reading actions followed by app
    /// actions and the version's small print. State controls action
    /// availability; selecting an enabled action passes its identifier to `send`.
    static func make(_ state: ChromeState, send: @escaping (String) -> Void) -> UIMenu {
        let autoScroll = action("Deslocamento automático", "arrow.down.circle", "auto-scroll", send: send)
        autoScroll.state = state.autoScrollVisible ? .on : .off
        if !state.autoScrollAvailable {
            autoScroll.attributes.insert(.disabled)
        }
        // A page that can't have it at all (the pastoral index) leaves it out;
        // a chapter in pages shows it disabled.
        var reading: [UIMenuElement] = state.autoScrollAvailable || state.viewMode != nil ? [autoScroll] : []
        if state.canShare {
            reading.append(action("Partilhar", "square.and.arrow.up", "share", send: send))
        }
        var app: [UIMenuElement] = [
            action("Como usar a app", "questionmark.circle", "help", send: send),
            action("Sobre a Bíblia", "info.circle", "about", send: send),
        ]
        if state.canReport {
            app.append(action("Reportar erro", "exclamationmark.bubble", "report", send: send))
        }
        app.append(action("Política de Privacidade", "hand.raised", "privacy", send: send))
        // Two groups with a divider, as the HIG asks of menus: what to do with
        // the reading, then the app's help and legal pages. Inline sections,
        // not submenus. The version's small print ends it.
        var sections = [
            UIMenu(options: .displayInline, children: reading),
            UIMenu(options: .displayInline, children: app),
        ]
        if let version = versionSection(buildVersion: state.buildVersion) {
            sections.append(version)
        }
        return UIMenu(children: sections)
    }
}
