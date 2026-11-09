import UIKit
import Capacitor

/// Window root: the web view fills the screen and the bars float above it as
/// siblings. Unlike a navigation controller's bars, these leave the web view's
/// safe area alone, so hiding them never shifts the page. The page pads its
/// scrolling content by `insets` instead, and the text scrolls under the glass.
/// Text in the bars grows to the largest standard text size, XXXL (23 pt body
/// text against 17), as in Apple's own bars; larger shows in the Large Content
/// Viewer on a long press.
private let barTextScaleLimit: CGFloat = 23 / 17

final class ChromeViewController: UIViewController, UINavigationBarDelegate, UIToolbarDelegate,
    UIGestureRecognizerDelegate, UIPopoverPresentationControllerDelegate {
    let bridgeController = MainViewController()

    let topBar = UINavigationBar()
    let readerItem = UINavigationItem()
    private let searchBackItem = UINavigationItem()
    private let searchItem = UINavigationItem(title: "Pesquisar")
    private let pageBackItem = UINavigationItem()
    private let pageItem = UINavigationItem()
    let toolbar = CentredToolbar()
    /// Auto-scroll's controls, while ⋯ shows them: floating over the text,
    /// where the reader drags them.
    let autoScrollControl = AutoScrollControl()
    let searchField = SearchFieldView()
    let toast = ToastView()
    var toastBottom: NSLayoutConstraint!
    private var topBarTop: NSLayoutConstraint!
    private var compactPassageBottom: NSLayoutConstraint!
    /// Where the toolbar, auto-scroll's bar and the toast go: the safe area's
    /// width, or, on an iPhone Duo folded part way, the screen right of the fold.
    let bottomBars = UILayoutGuide()
    private var bottomBarsLeft: NSLayoutConstraint!
    private var toolbarLeft: NSLayoutConstraint!
    private var toolbarRight: NSLayoutConstraint!

    private(set) var state = ChromeState()
    /// The buttons are in the navigation controller's bars, which iOS 27.1
    /// stands up in the vertical bar beside the status bar (the iPhone Duo),
    /// leaving the top and bottom of the screen to the page. Elsewhere those
    /// bars stay hidden and the floating ones above are used.
    var usesVerticalBar = false
    var collapsed = false
    /// Bars meant to be on screen; a fade-out may still be running for others.
    var shownBars = Set<ObjectIdentifier>()
    var reportedInsets = ChromeInsets()
    /// The width the toolbar's passage button was last fitted to.
    var fittedToolbarWidth: CGFloat = 0
    /// How far the toolbar reaches past the safe area on the left, where the
    /// wider side inset is there (CentredToolbar), and the space its leading
    /// items keep for it.
    var toolbarLeadingInset: CGFloat = 0
    var leadingInsetSpace = UIBarButtonItem.fixedSpace(0)
    var plugin: NativeChromePlugin { bridgeController.chromePlugin }

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
        autoScrollControl.send = { [weak self] id in self?.plugin.send(id) }
        autoScrollControl.onMoved = { [weak self] in self?.fadeAutoScrollForToast() }
        // Bar glyphs stay monochrome, like the rest of the native parts.
        topBar.tintColor = .label
        toolbar.tintColor = .label
        searchBackItem.backButtonDisplayMode = .minimal
        pageBackItem.backButtonDisplayMode = .minimal
        searchField.onSubmit = { [weak self] text in self?.plugin.send("search-submit", ["text": text]) }
        searchField.onChange = { [weak self] text in self?.plugin.send("search-input", ["text": text]) }

        for bar in [topBar, autoScrollControl, toolbar, compactPassage, searchField] as [UIView] {
            bar.translatesAutoresizingMaskIntoConstraints = false
            bar.alpha = 0
            bar.isHidden = true
            view.addSubview(bar)
        }
        toast.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(toast)
        toastBottom = toast.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        topBarTop = topBar.topAnchor.constraint(equalTo: view.topAnchor, constant: topBarOffset)
        compactPassageBottom = compactPassage.bottomAnchor.constraint(equalTo: view.bottomAnchor,
                                                                      constant: -compactPassageInset)

        // Dragging the page closes the search keyboard, as iOS search screens do.
        let drag = UIPanGestureRecognizer(target: self, action: #selector(pageDragged(_:)))
        drag.cancelsTouchesInView = false
        drag.delegate = self
        bridgeController.view.addGestureRecognizer(drag)
        // So does a tap on a filtered list: the row opens above the keyboard.
        let tap = UITapGestureRecognizer(target: self, action: #selector(pageTapped))
        tap.cancelsTouchesInView = false
        tap.delegate = self
        bridgeController.view.addGestureRecognizer(tap)

        // The page scrolls in an element of its own, which the web view's
        // scroll-to-top can't reach: the web app scrolls it (scroll-top).
        NotificationCenter.default.addObserver(self, selector: #selector(statusBarTapped),
                                               name: .capacitorStatusBarTapped, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(voiceOverChanged),
                                               name: UIAccessibility.voiceOverStatusDidChangeNotification,
                                               object: nil)

        let safeArea = view.safeAreaLayoutGuide
        view.addLayoutGuide(bottomBars)
        // Left and right, not leading and trailing: the fold's place is physical.
        bottomBarsLeft = bottomBars.leftAnchor.constraint(equalTo: safeArea.leftAnchor)
        toolbarLeft = toolbar.leftAnchor.constraint(equalTo: bottomBars.leftAnchor)
        toolbarRight = toolbar.rightAnchor.constraint(equalTo: bottomBars.rightAnchor)
        NSLayoutConstraint.activate([
            bottomBarsLeft,
            bottomBars.rightAnchor.constraint(equalTo: safeArea.rightAnchor),
            bottomBars.topAnchor.constraint(equalTo: safeArea.topAnchor),
            bottomBars.bottomAnchor.constraint(equalTo: safeArea.bottomAnchor),
            toastBottom,
            toast.centerXAnchor.constraint(equalTo: bottomBars.centerXAnchor),
            toast.leadingAnchor.constraint(greaterThanOrEqualTo: bottomBars.leadingAnchor, constant: 24),
            toast.trailingAnchor.constraint(lessThanOrEqualTo: bottomBars.trailingAnchor, constant: -24),
            topBarTop,
            topBar.leadingAnchor.constraint(equalTo: safeArea.leadingAnchor),
            topBar.trailingAnchor.constraint(equalTo: safeArea.trailingAnchor),
            toolbar.bottomAnchor.constraint(equalTo: safeArea.bottomAnchor),
            toolbarLeft,
            toolbarRight,
            compactPassageBottom,
            // Under the toolbar's passage, which centres on the screen.
            compactPassage.centerXAnchor.constraint(equalTo: toolbar.centerXAnchor),
            compactPassage.widthAnchor.constraint(lessThanOrEqualTo: bottomBars.widthAnchor, constant: -32),
            // The reading area, between the bars (where they rest, whether
            // shown or not), for the reader to move it about in.
            autoScrollControl.topAnchor.constraint(equalTo: topBar.bottomAnchor),
            autoScrollControl.bottomAnchor.constraint(equalTo: toolbar.topAnchor),
            autoScrollControl.leadingAnchor.constraint(equalTo: bottomBars.leadingAnchor),
            autoScrollControl.trailingAnchor.constraint(equalTo: bottomBars.trailingAnchor),
            searchField.leadingAnchor.constraint(equalTo: safeArea.leadingAnchor, constant: 16),
            searchField.trailingAnchor.constraint(equalTo: safeArea.trailingAnchor, constant: -16),
            // Rests above the home indicator, and rides up with the keyboard.
            searchField.bottomAnchor.constraint(equalTo: view.keyboardLayoutGuide.topAnchor, constant: -8),
        ])

        if #available(iOS 27.1, *) {
            // The fold's region turns on and off with the hinge: lay the bars
            // out again each time.
            view.addInteraction(UIHingeInteraction { [weak self] _, _ in self?.view.setNeedsLayout() })
        }
    }

    override func viewWillLayoutSubviews() {
        super.viewWillLayoutSubviews()
        // Folding or unfolding the Duo turns the vertical bar on or off: the
        // reader's buttons move bars, outside this layout pass.
        if verticalBarActive != usesVerticalBar {
            usesVerticalBar = verticalBarActive
            DispatchQueue.main.async { [weak self] in
                guard let self else { return }
                self.apply(self.state)
            }
        }
        topBarTop.constant = topBarOffset
        compactPassageBottom.constant = -compactPassageInset
        let fold = foldInset
        bottomBarsLeft.constant = fold
        // The open iPhone Duo's status bar runs down its right side: in the
        // safe area alone, the passage sat left of the text, which the page
        // centres on the screen. The bar reaches into the wider side inset as
        // far as the narrower one goes, so its centre is the screen's, and
        // centres its passage there (CentredToolbar). Folded part way, it
        // stays right of the fold.
        let insets = view.safeAreaInsets
        let even = min(insets.left, insets.right)
        toolbarLeft.constant = fold == 0 ? even - insets.left : 0
        toolbarRight.constant = fold == 0 ? insets.right - even : 0
        toolbarLeadingInset = -toolbarLeft.constant
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        reportInsets()
        placeToast()
        // Turned, or an iPad window resized: the book's name may fit now, or not.
        // Turned the other way, the wider inset may have changed sides.
        if state.mode == .reader
            && (toolbarWidth != fittedToolbarWidth || toolbarLeadingInset != leadingInsetSpace.width) {
            UIView.performWithoutAnimation { configureReader(state) }
        }
        // Hidden, the small passage waits where the toolbar's is, ready to
        // shrink from it: the first time too, and after a turn.
        if !collapsed && !UIAccessibility.isReduceMotionEnabled {
            compactPassage.transform = passageMorph().pill
        }
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
        for bar in [topBar, autoScrollControl, toolbar, compactPassage, searchField] as [UIView] {
            bar.isUserInteractionEnabled = !next.inert
            bar.accessibilityElementsHidden = next.inert
        }

        if usesVerticalBar {
            // The system bar isn't in the loop above: keep Voltar inert too.
            systemBackItem.isEnabled = !next.inert
        } else {
            setSystemBarItems(title: nil, left: [], right: [])
        }
        switch next.mode {
        case .reader:
            configureReader(next)
            setTopBarItems([readerItem], animated: previous.mode == .search)
            announceChanges(from: previous, to: next)
            if let placeholder = next.filterPlaceholder, next.filterOpen {
                searchField.placeholder = placeholder
                searchField.onClose = { [weak self] in self?.plugin.send("filter-close") }
                if let text = ChromeState.filterText(from: previous, to: next, editing: searchField.isEditing) {
                    searchField.text = text
                }
            }
        case .search:
            searchField.placeholder = "Procurar na Bíblia"
            searchField.onClose = nil
            setTopBarItems([searchBackItem, searchItem], animated: previous.mode == .reader)
            if usesVerticalBar {
                setSystemBarItems(title: searchItem.title, left: [systemBackItem], right: [])
            }
            if previous.mode != .search {
                searchField.text = next.query
            } else if next.query != previous.query && !searchField.isEditing {
                // Not while typing: a search that ran on a pause echoes its query.
                searchField.text = next.query
            }
        case .page:
            pageItem.title = next.title
            pageSearchItem.isEnabled = !next.inert
            let search = next.search ? pageSearchItem : nil
            if usesVerticalBar {
                pageItem.rightBarButtonItem = nil
                setSystemBarItems(title: next.title, left: [systemBackItem], right: search.map { [$0] } ?? [])
            } else if pageItem.rightBarButtonItem !== search {
                pageItem.rightBarButtonItem = search
            }
            setTopBarItems([pageBackItem, pageItem], animated: previous.mode != .none)
        case .none:
            break
        }
        if previous.showsSearchField && !next.showsSearchField {
            searchField.endEditing(true)
        }

        // VoiceOver users find the bars by swiping through the screen, not by
        // tapping where they were: for them the bars stay. So they do in the
        // vertical bar, beside the text rather than over it.
        let collapse = next.mode == .reader && next.collapsed && !UIAccessibility.isVoiceOverRunning
            && !usesVerticalBar
        let collapseChanged = collapse != collapsed
        collapsed = collapse
        let systemBars = usesVerticalBar && next.mode != .none
        setShown(topBar, next.mode != .none && !systemBars, animated: animated)
        setShown(toolbar, next.mode == .reader && !next.filterOpen, animated: animated)
        setShown(compactPassage, next.mode == .reader && !next.filterOpen, animated: animated)
        navigationController?.setNavigationBarHidden(!systemBars, animated: animated)
        let systemToolbar = next.mode == .reader && !next.filterOpen
            && (next.chapterNavigation || next.filterPlaceholder != nil)
        navigationController?.setToolbarHidden(!(systemBars && systemToolbar), animated: animated)
        setShown(searchField, next.showsSearchField, animated: animated)
        // Once shown: hidden, the field may not take the keyboard.
        if ChromeState.focusesSearchField(from: previous, to: next) {
            searchField.focus()
        }
        setShown(autoScrollControl, next.mode == .reader && next.autoScroll != nil, animated: animated)
        // Playing or paused, auto-scroll's controls stay or go with the bars.
        if collapseChanged || previous.inert != next.inert
            || previous.autoScroll?.playing != next.autoScroll?.playing {
            animateCollapse(animated: animated)
        }
        // The insets depend on the collapse too (auto-scroll's stack), which
        // no layout pass follows.
        reportInsets()

        // Auto-scroll is read hands-free: the screen mustn't lock under it.
        UIApplication.shared.isIdleTimerDisabled = next.mode == .reader && next.autoScroll?.playing == true

        setNeedsStatusBarAppearanceUpdate()
        view.layoutIfNeeded()
    }

    lazy var moreItem: UIBarButtonItem = {
        let item = UIBarButtonItem(image: UIImage(systemName: "ellipsis"), menu: nil)
        item.accessibilityLabel = "Mais"
        return item
    }()

    /// Marcadores, left of search.
    lazy var bookmarksItem = barButton("bookmark", "Marcadores", "bookmarks")

    /// Text size, theme and page or scroll, right of ⋯.
    lazy var fontItem: UIBarButtonItem = {
        let item = UIBarButtonItem(image: UIImage(systemName: "textformat.size"), menu: nil)
        item.accessibilityLabel = "Texto e aparência"
        return item
    }()

    /// Pesquisar, in the top bar's right corner, as in the web header.
    lazy var readerSearchItem = barButton("magnifyingglass", "Pesquisar", "search")

    /// Filters a list, in the chapter arrows' place on a page without them.
    lazy var filterItem = barButton("line.3.horizontal.decrease", "Filtrar", "filter")

    /// Pesquisar, on a plain page.
    private lazy var pageSearchItem = barButton("magnifyingglass", "Pesquisar", "search")

    // The toolbars' items too are made once and updated in place. Made anew
    // with each update, the one VoiceOver was on (an arrow, +) was gone after
    // a tap, and VoiceOver lost its place.

    lazy var previousItem = barButton("chevron.backward", "Capítulo anterior", "previous")
    lazy var nextItem = barButton("chevron.forward", "Capítulo seguinte", "next")
    /// Either side of the passage, which they centre. The same two each time,
    /// so that an unchanged toolbar compares equal.
    let passageSpaces = [UIBarButtonItem.flexibleSpace(), UIBarButtonItem.flexibleSpace()]

    /// "Marcos 1", which opens the passage picker.
    lazy var passageButton: UIButton = {
        var config = UIButton.Configuration.plain()
        config.baseForegroundColor = .label
        config.titleLineBreakMode = .byTruncatingTail
        // As Apple's bars do, it stops growing at the largest standard size
        // (XXXL); past it, a long press shows it large.
        config.titleTextAttributesTransformer = UIConfigurationTextAttributesTransformer { attributes in
            var attributes = attributes
            attributes.font = limitedFont(.systemFont(ofSize: 17, weight: .medium), .body, limit: barTextScaleLimit)
            return attributes
        }
        let button = UIButton(configuration: config, primaryAction: UIAction { [weak self] _ in
            self?.plugin.send("passage")
        })
        button.accessibilityHint = "Escolher livro e capítulo"
        button.showsLargeContentViewer = true
        // It gives way to its room (passageWidth), not to the bar: iOS 27.1's
        // toolbar, wide on the unfolded iPhone Duo, squeezed it to "Liv…".
        button.setContentCompressionResistancePriority(UILayoutPriority(999), for: .horizontal)
        return button
    }()

    /// At the largest text sizes even the shortest label may not fit: it's cut short.
    lazy var passageWidth: NSLayoutConstraint = {
        let width = passageButton.widthAnchor.constraint(lessThanOrEqualToConstant: 0)
        width.isActive = true
        return width
    }()

    lazy var passageItem = UIBarButtonItem(customView: passageButton)

    /// While the bars are hidden for reading, the passage stays at the bottom,
    /// small, as Safari keeps the site's name: a tap brings the bars back.
    lazy var compactPassage: UIButton = {
        var config: UIButton.Configuration
        if #available(iOS 26.0, *) {
            config = .glass()
        } else {
            config = .plain()
            config.background.visualEffect = UIBlurEffect(style: .systemThickMaterial)
        }
        config.cornerStyle = .capsule
        config.baseForegroundColor = .label
        config.titleLineBreakMode = .byTruncatingTail
        config.contentInsets = NSDirectionalEdgeInsets(top: 6, leading: 16, bottom: 6, trailing: 16)
        config.titleTextAttributesTransformer = UIConfigurationTextAttributesTransformer { attributes in
            var attributes = attributes
            attributes.font = limitedFont(.systemFont(ofSize: 13, weight: .medium), .footnote, limit: barTextScaleLimit)
            return attributes
        }
        let button = UIButton(configuration: config, primaryAction: UIAction { [weak self] _ in
            self?.plugin.send("show-bars")
        })
        button.accessibilityHint = "Mostrar os controlos"
        button.showsLargeContentViewer = true
        return button
    }()

    /// In the home indicator's strip, as Safari's; with none, clear of the edge.
    private var compactPassageInset: CGFloat { max(view.safeAreaInsets.bottom - 20, 8) }

    /// The passage the reader's bars last showed.
    var shownPassage: String?

    /// Back, in the vertical bar: the system bar there has no page under this
    /// one to go back to, so it gets the floating bar's back button as an item.
    private lazy var systemBackItem = barButton("chevron.backward", "Voltar", "back")

    /// A sheet asked for while the last one was on its way out, and its answer.
    var waitingSheet: (sheet: UIViewController, done: (Bool) -> Void)?

    var toastShowing = false

    weak var bookmarksSheet: BookmarksController?

    weak var reportSheet: ReportController?

    @objc private func voiceOverChanged() {
        apply(state)
    }

    @objc private func statusBarTapped() {
        // A sheet scrolls its own list.
        guard presentedViewController == nil, state.mode != .none else { return }
        plugin.send("scroll-top")
    }

    @objc private func pageDragged(_ drag: UIPanGestureRecognizer) {
        guard drag.state == .began, state.showsSearchField, searchField.isEditing else { return }
        searchField.endEditing(true)
    }

    @objc private func pageTapped() {
        guard state.filterOpen, searchField.isEditing else { return }
        searchField.endEditing(true)
    }

    /// The drag only watches: the page keeps scrolling as usual.
    func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer,
                           shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer) -> Bool {
        true
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
    static func prominentButton() -> UIButton {
        var config: UIButton.Configuration
        if #available(iOS 26.0, *) {
            config = .prominentGlass()
        } else {
            config = .borderedProminent()
            config.baseBackgroundColor = selectionFill
        }
        config.baseForegroundColor = onSelection
        config.cornerStyle = .capsule
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

/// A toolbar that centres its passage on its own width, not in its safe area,
/// which the open iPhone Duo's status bar narrows on the right only. UIKit
/// lays the items out between the safe area's sides and the layout margins
/// it takes from them: both have to give, or the passage stays off centre.
/// Each side keeps the narrower inset, so nothing lands under a notch.
final class CentredToolbar: UIToolbar {
    override init(frame: CGRect) {
        super.init(frame: frame)
        insetsLayoutMarginsFromSafeArea = false
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

    override var safeAreaInsets: UIEdgeInsets {
        var insets = super.safeAreaInsets
        insets.left = min(insets.left, insets.right)
        insets.right = insets.left
        return insets
    }
}

/// Window root: hosts the chrome so the reader's buttons can use the system
/// bars where iOS stands them up vertically; the chrome decides the bars, the
/// status bar and the orientations.
final class ChromeNavigationController: UINavigationController {
    override var childForStatusBarStyle: UIViewController? { topViewController }
    override var childForStatusBarHidden: UIViewController? { topViewController }
    override var childForHomeIndicatorAutoHidden: UIViewController? { topViewController }
    override var supportedInterfaceOrientations: UIInterfaceOrientationMask {
        topViewController?.supportedInterfaceOrientations ?? .all
    }
}
