import UIKit
import Capacitor

/// Window root: the web view fills the screen and the bars float above it as
/// siblings. Unlike a navigation controller's bars, these leave the web view's
/// safe area alone, so hiding them never shifts the page. The page pads its
/// scrolling content by `insets` instead, and the text scrolls under the glass.
final class ChromeViewController: UIViewController, UINavigationBarDelegate, UIToolbarDelegate,
    UIGestureRecognizerDelegate {
    let bridgeController = MainViewController()

    private let topBar = UINavigationBar()
    private let readerItem = UINavigationItem()
    private let searchBackItem = UINavigationItem()
    private let searchItem = UINavigationItem(title: "Pesquisar")
    private let pageBackItem = UINavigationItem()
    private let pageItem = UINavigationItem()
    private let toolbar = UIToolbar()
    /// Auto-scroll's controls, while ⋯ shows them: just above the toolbar, and
    /// in its place while the bars are hidden for reading.
    private let autoScrollBar = UIToolbar()
    private let searchField = SearchFieldView()
    private let toast = ToastView()
    private var toastBottom: NSLayoutConstraint!

    private(set) var state = ChromeState()
    private var collapsed = false
    /// Bars meant to be on screen; a fade-out may still be running for others.
    private var shownBars = Set<ObjectIdentifier>()
    private var reportedInsets = ChromeInsets()
    private var plugin: NativeChromePlugin { bridgeController.chromePlugin }

    override func viewDidLoad() {
        super.viewDidLoad()
        addChild(bridgeController)
        bridgeController.view.frame = view.bounds
        bridgeController.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(bridgeController.view)
        bridgeController.didMove(toParent: self)
        plugin.chrome = self

        topBar.delegate = self
        toolbar.delegate = self
        autoScrollBar.delegate = self
        // Bar glyphs stay monochrome, like the rest of the native parts.
        topBar.tintColor = .label
        toolbar.tintColor = .label
        autoScrollBar.tintColor = .label
        searchBackItem.backButtonDisplayMode = .minimal
        pageBackItem.backButtonDisplayMode = .minimal
        searchField.onSubmit = { [weak self] text in self?.plugin.send("search-submit", ["text": text]) }
        searchField.onChange = { [weak self] text in self?.plugin.send("search-input", ["text": text]) }

        for bar in [topBar, autoScrollBar, toolbar, searchField] as [UIView] {
            bar.translatesAutoresizingMaskIntoConstraints = false
            bar.alpha = 0
            bar.isHidden = true
            view.addSubview(bar)
        }
        toast.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(toast)
        toastBottom = toast.bottomAnchor.constraint(equalTo: view.bottomAnchor)

        // Dragging the page closes the search keyboard, as iOS search screens do.
        let drag = UIPanGestureRecognizer(target: self, action: #selector(pageDragged(_:)))
        drag.cancelsTouchesInView = false
        drag.delegate = self
        bridgeController.view.addGestureRecognizer(drag)

        // The page scrolls in an element of its own, which the web view's
        // scroll-to-top can't reach: the web app scrolls it (scroll-top).
        NotificationCenter.default.addObserver(self, selector: #selector(statusBarTapped),
                                               name: .capacitorStatusBarTapped, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(voiceOverChanged),
                                               name: UIAccessibility.voiceOverStatusDidChangeNotification,
                                               object: nil)

        let safeArea = view.safeAreaLayoutGuide
        NSLayoutConstraint.activate([
            toastBottom,
            toast.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            toast.leadingAnchor.constraint(greaterThanOrEqualTo: safeArea.leadingAnchor, constant: 24),
            toast.trailingAnchor.constraint(lessThanOrEqualTo: safeArea.trailingAnchor, constant: -24),
            topBar.topAnchor.constraint(equalTo: safeArea.topAnchor),
            topBar.leadingAnchor.constraint(equalTo: safeArea.leadingAnchor),
            topBar.trailingAnchor.constraint(equalTo: safeArea.trailingAnchor),
            toolbar.bottomAnchor.constraint(equalTo: safeArea.bottomAnchor),
            toolbar.leadingAnchor.constraint(equalTo: safeArea.leadingAnchor),
            toolbar.trailingAnchor.constraint(equalTo: safeArea.trailingAnchor),
            // In the toolbar's place; lifted above it while it shows.
            autoScrollBar.bottomAnchor.constraint(equalTo: safeArea.bottomAnchor),
            autoScrollBar.leadingAnchor.constraint(equalTo: safeArea.leadingAnchor),
            autoScrollBar.trailingAnchor.constraint(equalTo: safeArea.trailingAnchor),
            searchField.leadingAnchor.constraint(equalTo: safeArea.leadingAnchor, constant: 16),
            searchField.trailingAnchor.constraint(equalTo: safeArea.trailingAnchor, constant: -16),
            // Rests above the home indicator, and rides up with the keyboard.
            searchField.bottomAnchor.constraint(equalTo: view.keyboardLayoutGuide.topAnchor, constant: -8),
        ])
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        reportInsets()
        // Just above whatever is at the bottom: the toolbar, the search field.
        toastBottom.constant = -(insets.bottom + 12)
    }

    // MARK: - State

    func apply(_ next: ChromeState) {
        let previous = state
        state = next
        let animated = previous.mode != .none || next.mode != .none

        // The in-app theme can differ from the device's. Applied to the whole
        // window, so sheets, menus and the keyboard match it, not just the bars.
        // Pages without bars send no theme; they keep the last one.
        if next.mode != .none {
            view.window?.overrideUserInterfaceStyle = Self.interfaceStyle(next.themeMode)
        }
        for bar in [topBar, autoScrollBar, toolbar, searchField] as [UIView] {
            bar.isUserInteractionEnabled = !next.inert
            bar.accessibilityElementsHidden = next.inert
        }

        switch next.mode {
        case .reader:
            configureReader(next)
            if previous.mode != .reader {
                topBar.setItems([readerItem], animated: previous.mode == .search)
            }
        case .search:
            searchItem.leftBarButtonItem = nil
            if previous.mode != .search {
                topBar.setItems([searchBackItem, searchItem], animated: previous.mode == .reader)
                searchField.text = next.query
                searchField.focus()
            } else if next.query != previous.query && !searchField.isEditing {
                // Not while typing: a search that ran on a pause echoes its query.
                searchField.text = next.query
            }
        case .page:
            pageItem.title = next.title
            if next.search {
                let search = barButton("magnifyingglass", "Pesquisar", "search")
                search.isEnabled = !next.inert
                pageItem.rightBarButtonItem = search
            } else {
                pageItem.rightBarButtonItem = nil
            }
            if previous.mode != .page {
                topBar.setItems([pageBackItem, pageItem], animated: previous.mode != .none)
            }
        case .none:
            break
        }
        if previous.mode == .search && next.mode != .search {
            searchField.endEditing(true)
        }

        // VoiceOver users find the bars by swiping through the screen, not by
        // tapping where they were: for them the bars stay.
        let collapse = next.mode == .reader && next.collapsed && !UIAccessibility.isVoiceOverRunning
        let collapseChanged = collapse != collapsed
        collapsed = collapse
        setShown(topBar, next.mode != .none, animated: animated)
        setShown(toolbar, next.mode == .reader, animated: animated)
        setShown(searchField, next.mode == .search, animated: animated)
        let showAutoScroll = next.mode == .reader && next.autoScroll != nil
        if showAutoScroll && !shownBars.contains(ObjectIdentifier(autoScrollBar)) {
            // Fades in where it belongs, without sliding there.
            view.layoutIfNeeded()
            autoScrollBar.transform = autoScrollBarOffset
        }
        setShown(autoScrollBar, showAutoScroll, animated: animated)
        if collapseChanged || previous.inert != next.inert {
            animateCollapse(animated: animated)
        }

        setNeedsStatusBarAppearanceUpdate()
        view.layoutIfNeeded()
    }

    private lazy var moreItem: UIBarButtonItem = {
        let item = UIBarButtonItem(image: UIImage(systemName: "ellipsis"), menu: nil)
        item.accessibilityLabel = "Mais"
        return item
    }()

    /// Marcadores, to the left of ⋯.
    private lazy var bookmarksItem = barButton("bookmark", "Marcadores", "bookmarks")

    /// Text size, theme and page or scroll, to the left of Marcadores.
    private lazy var fontItem: UIBarButtonItem = {
        let item = UIBarButtonItem(image: UIImage(systemName: "textformat.size"), menu: nil)
        item.accessibilityLabel = "Texto e tema"
        return item
    }()

    private func configureReader(_ state: ChromeState) {
        let enabled = !state.inert
        // The same item throughout, its menu updated: replacing the item
        // would close the menu while a choice that keeps it open is applied.
        let send: (String) -> Void = { [weak self] id in self?.plugin.send(id) }
        moreItem.menu = ReaderMenu.make(state, send: send)
        fontItem.menu = ReaderMenu.font(state, send: send)
        moreItem.isEnabled = enabled
        bookmarksItem.isEnabled = enabled
        fontItem.isEnabled = enabled
        if readerItem.rightBarButtonItems?.first !== moreItem {
            // Rightmost first: text size, Marcadores, then ⋯, each in a glass
            // circle of its own rather than one shared capsule.
            let items = [moreItem, bookmarksItem, fontItem]
            if #available(iOS 26.0, *) {
                for item in items { item.sharesBackground = false }
            }
            readerItem.rightBarButtonItems = items
        }

        if let autoScroll = state.autoScroll {
            autoScrollBar.setItems(autoScrollItems(autoScroll, enabled: enabled), animated: false)
        }

        var items: [UIBarButtonItem] = []
        if state.chapterNavigation {
            let previous = barButton("chevron.backward", "Capítulo anterior", "previous")
            previous.isEnabled = enabled && state.canGoPrevious
            let next = barButton("chevron.forward", "Capítulo seguinte", "next")
            next.isEnabled = enabled && state.canGoNext
            items += [previous, next]
        }
        items += [.flexibleSpace(), passageItem(state, enabled: enabled), .flexibleSpace()]
        if state.search {
            let search = barButton("magnifyingglass", "Pesquisar", "search")
            search.isEnabled = enabled
            items.append(search)
        }
        toolbar.setItems(items, animated: false)
    }

    /// "Marcos 1", which opens the passage picker.
    private func passageItem(_ state: ChromeState, enabled: Bool) -> UIBarButtonItem {
        var config = UIButton.Configuration.plain()
        config.title = state.passageLabel
        config.baseForegroundColor = .label
        config.titleTextAttributesTransformer = UIConfigurationTextAttributesTransformer { attributes in
            var attributes = attributes
            attributes.font = UIFontMetrics(forTextStyle: .body).scaledFont(for: .systemFont(ofSize: 17, weight: .medium))
            return attributes
        }
        let button = UIButton(configuration: config, primaryAction: UIAction { [weak self] _ in
            self?.plugin.send("passage")
        })
        button.accessibilityLabel = state.passageAccessibilityLabel
        button.accessibilityHint = "Escolher livro e capítulo"
        button.isEnabled = enabled
        return UIBarButtonItem(customView: button)
    }

    /// Auto-scroll's controls: close, then speed, then play or pause.
    private func autoScrollItems(_ state: AutoScrollState, enabled: Bool) -> [UIBarButtonItem] {
        let close = barButton("xmark", "Fechar o deslocamento automático", "auto-scroll")
        let slower = barButton("minus", "Diminuir velocidade", "auto-scroll-slower")
        slower.isEnabled = enabled && state.canSlower
        let faster = barButton("plus", "Aumentar velocidade", "auto-scroll-faster")
        faster.isEnabled = enabled && state.canFaster

        let speed = UILabel()
        speed.text = state.speedLabel
        speed.font = .monospacedDigitSystemFont(ofSize: UIFont.preferredFont(forTextStyle: .subheadline).pointSize,
                                                weight: .medium)
        speed.textAlignment = .center
        speed.accessibilityLabel = "Velocidade: \(state.speedLabel)"
        let speedItem = UIBarButtonItem(customView: speed)

        // A plain bar button, like close: the bar stays monochrome.
        let play = barButton(state.playing ? "pause.fill" : "play.fill",
                             state.playing ? "Pausar" : "Iniciar", "auto-scroll-toggle")
        play.isEnabled = enabled
        close.isEnabled = enabled

        return [close, .flexibleSpace(), slower, speedItem, faster, .flexibleSpace(), play]
    }

    private func barButton(_ symbol: String, _ label: String, _ action: String) -> UIBarButtonItem {
        let item = UIBarButtonItem(image: UIImage(systemName: symbol), primaryAction: UIAction { [weak self] _ in
            self?.plugin.send(action)
        })
        item.accessibilityLabel = label
        return item
    }

    // MARK: - Showing and hiding

    private func setShown(_ bar: UIView, _ shown: Bool, animated: Bool) {
        let id = ObjectIdentifier(bar)
        guard shownBars.contains(id) != shown else { return }
        if shown {
            shownBars.insert(id)
            bar.isHidden = false
        } else {
            shownBars.remove(id)
        }
        let changes = { bar.alpha = self.targetAlpha(bar) }
        let done: (Bool) -> Void = { _ in
            if !self.shownBars.contains(id) { bar.isHidden = true }
        }
        if animated {
            UIView.animate(withDuration: 0.25, delay: 0, options: [.beginFromCurrentState], animations: changes, completion: done)
        } else {
            changes()
            done(true)
        }
    }

    private func targetAlpha(_ bar: UIView) -> CGFloat {
        guard shownBars.contains(ObjectIdentifier(bar)) else { return 0 }
        // Auto-scroll's pause stays within reach while the bars are hidden for
        // reading, but not over a panel, as the other bars don't.
        if bar === autoScrollBar { return state.inert ? 0 : 1 }
        return collapsed && bar !== searchField ? 0 : 1
    }

    /// Above the toolbar while it shows; in its place while it's hidden.
    private var autoScrollBarOffset: CGAffineTransform {
        collapsed ? .identity : CGAffineTransform(translationX: 0, y: -toolbar.bounds.height)
    }

    /// Slides the reader's bars off screen. The page keeps its padding, so the
    /// text doesn't move; it simply shows where the bars were.
    private func animateCollapse(animated: Bool) {
        let slide = collapsed && !UIAccessibility.isReduceMotionEnabled
        let changes = {
            self.topBar.transform = slide ? CGAffineTransform(translationX: 0, y: -self.insets.top) : .identity
            self.toolbar.transform = slide ? CGAffineTransform(translationX: 0, y: self.insets.bottom) : .identity
            self.autoScrollBar.transform = self.autoScrollBarOffset
            for bar in [self.topBar, self.toolbar, self.autoScrollBar] { bar.alpha = self.targetAlpha(bar) }
        }
        if animated {
            UIView.animate(withDuration: 0.4, delay: 0, usingSpringWithDamping: 1, initialSpringVelocity: 0,
                           options: [.beginFromCurrentState, .allowUserInteraction], animations: changes)
        } else {
            changes()
        }
    }

    // MARK: - Insets

    /// Measured from the layout, not the frames, which the collapse transforms.
    /// Without bars, only the status bar and home indicator cover the page.
    var insets: ChromeInsets {
        let safeArea = view.safeAreaInsets
        switch state.mode {
        case .none:
            return ChromeInsets(top: safeArea.top, bottom: safeArea.bottom)
        case .reader:
            // Auto-scroll's controls stack above the toolbar.
            let autoScroll = state.autoScroll != nil ? autoScrollBar.bounds.height : 0
            return ChromeInsets(top: safeArea.top + topBar.bounds.height,
                                bottom: safeArea.bottom + toolbar.bounds.height + autoScroll)
        case .search:
            return ChromeInsets(top: safeArea.top + topBar.bounds.height,
                                bottom: view.bounds.height - searchField.frame.minY)
        case .page:
            return ChromeInsets(top: safeArea.top + topBar.bounds.height, bottom: safeArea.bottom)
        }
    }

    private func reportInsets() {
        let current = insets
        guard current != reportedInsets else { return }
        reportedInsets = current
        plugin.sendInsets(current)
    }

    // MARK: - Passage picker

    func presentPicker(_ data: PassagePickerData) {
        guard presentedViewController == nil else { return }
        let picker = PassagePickerController(data: data) { [weak self] bookId, chapter in
            var payload: [String: Any] = ["bookId": bookId]
            if let chapter { payload["chapter"] = chapter }
            self?.plugin.send("goto", payload)
        }
        present(picker, animated: true)
    }

    // MARK: - Toast

    /// As a `button`, the toast is one (led by `symbol`), and tapping it
    /// sends toast-action.
    func showToast(_ message: String, button: Bool = false, symbol: String? = nil) {
        view.layoutIfNeeded()
        let onTap: (() -> Void)? = button ? { [weak self] in self?.plugin.send("toast-action") } : nil
        toast.show(message, symbol: symbol, onTap: onTap)
    }

    @objc private func voiceOverChanged() {
        apply(state)
    }

    @objc private func statusBarTapped() {
        // A sheet scrolls its own list.
        guard presentedViewController == nil, state.mode != .none else { return }
        plugin.send("scroll-top")
    }

    @objc private func pageDragged(_ drag: UIPanGestureRecognizer) {
        guard drag.state == .began, state.mode == .search, searchField.isEditing else { return }
        searchField.endEditing(true)
    }

    /// The drag only watches: the page keeps scrolling as usual.
    func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer,
                           shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer) -> Bool {
        true
    }

    // MARK: - Bookmarks

    private(set) weak var bookmarksSheet: BookmarksController?

    /// False, and nothing shown, while another sheet is up.
    @discardableResult
    func presentBookmarks(_ state: BookmarksSheetState) -> Bool {
        guard presentedViewController == nil else { return false }
        let bookmarks = BookmarksController(state: state, send: { [weak self] action, color in
            self?.plugin.send(action, ["color": color])
        }, onClose: { [weak self] in
            self?.plugin.send("bookmarks-closed")
        })
        bookmarksSheet = bookmarks
        let sheet = UINavigationController(rootViewController: bookmarks)
        sheet.modalPresentationStyle = .pageSheet
        if let controller = sheet.sheetPresentationController {
            // Just tall enough for the two rows of ribbons and the hint.
            if #available(iOS 16.0, *) {
                controller.detents = [.custom { _ in 300 }]
            } else {
                controller.detents = [.medium()]
            }
            controller.prefersGrabberVisible = true
        }
        present(sheet, animated: true)
        return true
    }

    // MARK: - Footnotes

    /// False, and nothing shown, while another sheet is up.
    @discardableResult
    func presentFootnotes(_ state: FootnotesSheetState) -> Bool {
        guard presentedViewController == nil else { return false }
        let footnotes = FootnotesController(state: state, onLink: { [weak self] index in
            self?.plugin.send("footnote-link", ["index": index])
        }, onClose: { [weak self] in
            self?.plugin.send("footnotes-closed")
        })
        let sheet = UINavigationController(rootViewController: footnotes)
        sheet.modalPresentationStyle = .pageSheet
        if let controller = sheet.sheetPresentationController {
            // Half height leaves the verse in view; long notes pull up to full.
            controller.detents = [.medium(), .large()]
            controller.prefersGrabberVisible = true
        }
        present(sheet, animated: true)
        return true
    }

    // MARK: - Report

    private(set) weak var reportSheet: ReportController?

    /// False, and nothing shown, while another sheet is up.
    @discardableResult
    func presentReport(_ state: ReportSheetState) -> Bool {
        guard presentedViewController == nil else { return false }
        let report = ReportController(state: state, onSubmit: { [weak self] topic, details in
            self?.plugin.send("report-submit", ["topic": topic, "details": details])
        }, onClose: { [weak self] in
            self?.plugin.send("report-closed")
        })
        reportSheet = report
        let sheet = UINavigationController(rootViewController: report)
        sheet.modalPresentationStyle = traitCollection.horizontalSizeClass == .regular ? .formSheet : .pageSheet
        present(sheet, animated: true)
        return true
    }

    // MARK: - Onboarding

    func presentOnboarding(_ steps: [OnboardingStepData], onFinish: @escaping (Bool, String) -> Void) {
        let onboarding = OnboardingController(steps: steps, onFinish: onFinish)
        let sheet = UINavigationController(rootViewController: onboarding)
        sheet.modalPresentationStyle = traitCollection.horizontalSizeClass == .regular ? .formSheet : .pageSheet
        sheet.presentationController?.delegate = onboarding
        var presenter: UIViewController = self
        while let presented = presenter.presentedViewController { presenter = presented }
        presenter.present(sheet, animated: true)
    }

    // MARK: - Delegates

    func position(for bar: UIBarPositioning) -> UIBarPosition {
        bar === topBar ? .topAttached : .bottom
    }

    /// The Back button of the search page: the web app does the navigating.
    func navigationBar(_ navigationBar: UINavigationBar, shouldPop item: UINavigationItem) -> Bool {
        plugin.send("back")
        return false
    }

    // MARK: - System appearance

    /// With no native bars the page's brown header is under the status bar, and
    /// the web app sets the style through Capacitor's SystemBars plugin.
    override var preferredStatusBarStyle: UIStatusBarStyle {
        state.mode == .none ? bridgeController.preferredStatusBarStyle : Self.statusBarStyle(state.themeMode)
    }
    override var childForStatusBarHidden: UIViewController? { bridgeController }
    override var supportedInterfaceOrientations: UIInterfaceOrientationMask {
        bridgeController.supportedInterfaceOrientations
    }

    // The app has no accent colour: while reading, the only colour on screen
    // is the text's red, so the native parts stay monochrome. The current item
    // and the main buttons are the text colour, inverted, as in Calendar.
    // Explicit colours: in glass sheets the system background colours resolve
    // to clear.

    /// Fill for the current item and the main buttons.
    static let selectionFill = UIColor { traits in
        traits.userInterfaceStyle == .dark ? UIColor(white: 0.96, alpha: 1) : UIColor(white: 0.1, alpha: 1)
    }

    /// Text and symbols on `selectionFill`.
    static let onSelection = UIColor { traits in
        traits.userInterfaceStyle == .dark ? .black : .white
    }

    /// A capsule main-action button: glass on iOS 26, filled before.
    static func prominentButton(title: String? = nil, symbol: String? = nil) -> UIButton {
        var config: UIButton.Configuration
        if #available(iOS 26.0, *) {
            config = .prominentGlass()
        } else {
            config = .borderedProminent()
            config.baseBackgroundColor = selectionFill
        }
        config.baseForegroundColor = onSelection
        config.cornerStyle = .capsule
        config.title = title
        config.image = symbol.flatMap { UIImage(systemName: $0) }
        let button = UIButton(configuration: config)
        button.tintColor = selectionFill
        return button
    }

    /// The in-app theme can differ from the device's; "system" follows the device.
    static func interfaceStyle(_ mode: String) -> UIUserInterfaceStyle {
        switch mode {
        case "light": return .light
        case "dark": return .dark
        default: return .unspecified
        }
    }

    private static func statusBarStyle(_ mode: String) -> UIStatusBarStyle {
        switch mode {
        case "light": return .darkContent
        case "dark": return .lightContent
        default: return .default
        }
    }
}

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
            let modes = [("paged", "Páginas", "book"),
                         ("scrolling", "Deslocamento", "arrow.up.and.down.text.horizontal")]
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
        return UIMenu(children: sections)
    }

    static func make(_ state: ChromeState, send: @escaping (String) -> Void) -> UIMenu {
        let autoScroll = action("Deslocamento automático", "arrow.down.circle", "auto-scroll", send: send)
        autoScroll.state = state.autoScrollVisible ? .on : .off
        if !state.autoScrollAvailable {
            autoScroll.attributes.insert(.disabled)
        }
        var items: [UIMenuElement] = [autoScroll]
        if state.canShare {
            items.append(action("Partilhar", "square.and.arrow.up", "share", send: send))
        }
        if state.canReport {
            items.append(action("Reportar erro", "exclamationmark.bubble", "report", send: send))
        }
        items.append(action("Como usar a app", "questionmark.circle", "help", send: send))
        items.append(action("Política de Privacidade", "hand.raised", "privacy", send: send))
        return UIMenu(children: items)
    }
}

/// The search page's field: glass, at the bottom, above the keyboard.
final class SearchFieldView: UIView, UITextFieldDelegate {
    var onSubmit: ((String) -> Void)?
    /// Every edit: the web app searches once typing pauses.
    var onChange: ((String) -> Void)?
    private let field = UISearchTextField()
    private let background: UIVisualEffectView

    var text: String {
        get { field.text ?? "" }
        set { field.text = newValue }
    }

    var isEditing: Bool { field.isEditing }

    init() {
        if #available(iOS 26.0, *) {
            background = UIVisualEffectView(effect: UIGlassEffect())
        } else {
            background = UIVisualEffectView(effect: UIBlurEffect(style: .systemThinMaterial))
        }
        super.init(frame: .zero)

        background.clipsToBounds = true
        background.translatesAutoresizingMaskIntoConstraints = false
        addSubview(background)

        field.placeholder = "Procurar na Bíblia"
        field.returnKeyType = .search
        field.backgroundColor = .clear
        field.borderStyle = .none
        field.autocorrectionType = .no
        field.delegate = self
        field.addAction(UIAction { [weak self] _ in self?.onChange?(self?.text ?? "") }, for: .editingChanged)
        field.translatesAutoresizingMaskIntoConstraints = false
        background.contentView.addSubview(field)

        NSLayoutConstraint.activate([
            background.leadingAnchor.constraint(equalTo: leadingAnchor),
            background.trailingAnchor.constraint(equalTo: trailingAnchor),
            background.topAnchor.constraint(equalTo: topAnchor),
            background.bottomAnchor.constraint(equalTo: bottomAnchor),
            heightAnchor.constraint(equalToConstant: 48),
            field.leadingAnchor.constraint(equalTo: background.contentView.leadingAnchor, constant: 14),
            field.trailingAnchor.constraint(equalTo: background.contentView.trailingAnchor, constant: -14),
            field.centerYAnchor.constraint(equalTo: background.contentView.centerYAnchor),
        ])
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

    override func layoutSubviews() {
        super.layoutSubviews()
        background.layer.cornerRadius = bounds.height / 2
    }

    func focus() {
        field.becomeFirstResponder()
    }

    func textFieldShouldReturn(_ textField: UITextField) -> Bool {
        onSubmit?(textField.text ?? "")
        textField.resignFirstResponder()
        return false
    }
}
