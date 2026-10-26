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

    private let topBar = UINavigationBar()
    private let readerItem = UINavigationItem()
    private let searchBackItem = UINavigationItem()
    private let searchItem = UINavigationItem(title: "Pesquisar")
    private let pageBackItem = UINavigationItem()
    private let pageItem = UINavigationItem()
    private let toolbar = CentredToolbar()
    /// Auto-scroll's controls, while ⋯ shows them: floating over the text,
    /// where the reader drags them.
    private let autoScrollControl = AutoScrollControl()
    private let searchField = SearchFieldView()
    private let toast = ToastView()
    private var toastBottom: NSLayoutConstraint!
    private var topBarTop: NSLayoutConstraint!
    private var compactPassageBottom: NSLayoutConstraint!
    /// Where the toolbar, auto-scroll's bar and the toast go: the safe area's
    /// width, or, on an iPhone Duo folded part way, the screen right of the fold.
    private let bottomBars = UILayoutGuide()
    private var bottomBarsLeft: NSLayoutConstraint!
    private var toolbarLeft: NSLayoutConstraint!
    private var toolbarRight: NSLayoutConstraint!

    private(set) var state = ChromeState()
    /// The buttons are in the navigation controller's bars, which iOS 27.1
    /// stands up in the vertical bar beside the status bar (the iPhone Duo),
    /// leaving the top and bottom of the screen to the page. Elsewhere those
    /// bars stay hidden and the floating ones above are used.
    private var usesVerticalBar = false
    private var collapsed = false
    /// Bars meant to be on screen; a fade-out may still be running for others.
    private var shownBars = Set<ObjectIdentifier>()
    private var reportedInsets = ChromeInsets()
    /// The width the toolbar's passage button was last fitted to.
    private var fittedToolbarWidth: CGFloat = 0
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

        #if canImport(UIKit, _version: 9127.0.85)
        if #available(iOS 27.1, *) {
            // The fold's region turns on and off with the hinge: lay the bars
            // out again each time.
            view.addInteraction(UIHingeInteraction { [weak self] _, _ in self?.view.setNeedsLayout() })
        }
        #endif
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
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        reportInsets()
        placeToast()
        // Turned, or an iPad window resized: the book's name may fit now, or not.
        if state.mode == .reader && toolbarWidth != fittedToolbarWidth {
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

        if !usesVerticalBar {
            setSystemBarItems(title: nil, left: [], right: [])
        }
        switch next.mode {
        case .reader:
            configureReader(next)
            setTopBarItems([readerItem], animated: previous.mode == .search)
            announceChanges(from: previous, to: next)
        case .search:
            searchItem.leftBarButtonItem = nil
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
        if previous.mode == .search && next.mode != .search {
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
        setShown(toolbar, next.mode == .reader, animated: animated)
        setShown(compactPassage, next.mode == .reader, animated: animated)
        navigationController?.setNavigationBarHidden(!systemBars, animated: animated)
        navigationController?.setToolbarHidden(!(systemBars && next.mode == .reader && next.chapterNavigation),
                                               animated: animated)
        setShown(searchField, next.mode == .search, animated: animated)
        // Once shown: hidden, the field may not take the keyboard.
        if next.mode == .search && previous.mode != .search {
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

    private lazy var moreItem: UIBarButtonItem = {
        let item = UIBarButtonItem(image: UIImage(systemName: "ellipsis"), menu: nil)
        item.accessibilityLabel = "Mais"
        return item
    }()

    /// Marcadores, left of search.
    private lazy var bookmarksItem = barButton("bookmark", "Marcadores", "bookmarks")

    /// Text size, theme and page or scroll, right of ⋯.
    private lazy var fontItem: UIBarButtonItem = {
        let item = UIBarButtonItem(image: UIImage(systemName: "textformat.size"), menu: nil)
        item.accessibilityLabel = "Texto e aparência"
        return item
    }()

    /// Pesquisar, in the top bar's right corner, as in the web header.
    private lazy var readerSearchItem = barButton("magnifyingglass", "Pesquisar", "search")

    /// Pesquisar, on a plain page.
    private lazy var pageSearchItem = barButton("magnifyingglass", "Pesquisar", "search")

    // The toolbars' items too are made once and updated in place. Made anew
    // with each update, the one VoiceOver was on (an arrow, +) was gone after
    // a tap, and VoiceOver lost its place.

    private lazy var previousItem = barButton("chevron.backward", "Capítulo anterior", "previous")
    private lazy var nextItem = barButton("chevron.forward", "Capítulo seguinte", "next")
    /// Either side of the passage, which they centre. The same two each time,
    /// so that an unchanged toolbar compares equal.
    private let passageSpaces = [UIBarButtonItem.flexibleSpace(), UIBarButtonItem.flexibleSpace()]

    /// "Marcos 1", which opens the passage picker.
    private lazy var passageButton: UIButton = {
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
    private lazy var passageWidth: NSLayoutConstraint = {
        let width = passageButton.widthAnchor.constraint(lessThanOrEqualToConstant: 0)
        width.isActive = true
        return width
    }()

    private lazy var passageItem = UIBarButtonItem(customView: passageButton)

    /// While the bars are hidden for reading, the passage stays at the bottom,
    /// small, as Safari keeps the site's name: a tap brings the bars back.
    private lazy var compactPassage: UIButton = {
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

    private func configureReader(_ state: ChromeState) {
        let enabled = !state.inert
        // The same item throughout, its menu updated: replacing the item
        // would close the menu while a choice that keeps it open is applied.
        let send: (String) -> Void = { [weak self] id in self?.plugin.send(id) }
        moreItem.menu = ReaderMenu.make(state, send: send)
        fontItem.menu = ReaderMenu.font(state, send: send)
        moreItem.isEnabled = enabled
        bookmarksItem.isEnabled = enabled
        // The chapter's ribbon, in its colour; the bars are otherwise monochrome.
        if let color = state.bookmarkColor.flatMap(ribbonColor) {
            bookmarksItem.image = UIImage(systemName: "bookmark.fill")?
                .withTintColor(color, renderingMode: .alwaysOriginal)
        } else {
            bookmarksItem.image = UIImage(systemName: "bookmark")
        }
        bookmarksItem.accessibilityValue = state.bookmarkName.map { "marcador \($0) neste capítulo" }
        fontItem.isEnabled = enabled
        // An item shows in one bar at a time: the other bar lets go of it.
        let barItem = usesVerticalBar ? navigationItem : readerItem
        if usesVerticalBar {
            readerItem.leftBarButtonItems = nil
            readerItem.rightBarButtonItems = nil
            navigationItem.title = nil
        }
        if barItem.leftBarButtonItems?.first !== moreItem {
            // As the web header: its menu in the left corner, here ⋯, then the
            // text button, each in a glass circle of its own rather than one
            // shared capsule.
            let items = [moreItem, fontItem]
            if #available(iOS 26.0, *) {
                for item in items { item.sharesBackground = false }
            }
            barItem.leftBarButtonItems = items
        }
        readerSearchItem.isEnabled = enabled
        // Rightmost first: search in the corner, as in the web header, then
        // Marcadores.
        let rightItems = (state.search ? [readerSearchItem] : []) + [bookmarksItem]
        if barItem.rightBarButtonItems ?? [] != rightItems {
            if #available(iOS 26.0, *) {
                for item in rightItems { item.sharesBackground = false }
            }
            barItem.rightBarButtonItems = rightItems
        }

        if let autoScroll = state.autoScroll {
            autoScrollControl.configure(autoScroll, enabled: enabled)
        }

        if var config = compactPassage.configuration {
            config.title = state.passageLabel
            compactPassage.configuration = config
        }
        compactPassage.accessibilityLabel = state.passageAccessibilityLabel
        compactPassage.largeContentTitle = state.passageLabel

        previousItem.isEnabled = enabled && state.canGoPrevious
        nextItem.isEnabled = enabled && state.canGoNext
        fittedToolbarWidth = toolbarWidth
        let arrows = state.chapterNavigation ? [previousItem, nextItem] : []
        let room = toolbarWidth - 2 * (Glass.barMargin + Glass.padding)
            - (arrows.isEmpty || usesVerticalBar ? 0 : Glass.pair + Glass.gap)
        configurePassage(state, enabled: enabled, room: room)
        // In the vertical bar the arrows join its column. The passage stays in
        // the floating toolbar, which centres it on the screen, under the page;
        // the system toolbar would centre it in its own strip, off the text.
        let floating = (usesVerticalBar ? [] : arrows) + [passageSpaces[0], passageItem, passageSpaces[1]]
        let system = usesVerticalBar ? arrows : []
        // An item shows in one bar at a time: the bar losing it lets go first.
        let setFloating = { if self.toolbar.items ?? [] != floating { self.toolbar.setItems(floating, animated: false) } }
        let setSystem = { if self.toolbarItems ?? [] != system { self.setToolbarItems(system, animated: false) } }
        if usesVerticalBar {
            setFloating()
            setSystem()
        } else {
            setSystem()
            setFloating()
        }
    }

    /// Where the book's name doesn't fit in `room`, "Dt 3": too wide a toolbar
    /// runs past the screen's edges (iOS 26) or moves its last items, this one
    /// too, into a ⋯ menu (27).
    private func configurePassage(_ state: ChromeState, enabled: Bool, room: CGFloat) {
        guard var config = passageButton.configuration else { return }
        config.title = state.passageLabel
        passageButton.configuration = config
        // Each shorter form only while the one applied so far is too wide: at
        // 390 pt "Sl 23 (22)" stays, "Sl 103 (102)" gives way to "Sl 103".
        for label in state.passageShortLabels where passageButton.intrinsicContentSize.width > room {
            config.title = label
            passageButton.configuration = config
        }
        passageWidth.constant = max(room, 0)
        passageButton.accessibilityLabel = state.passageAccessibilityLabel
        passageButton.largeContentTitle = state.passageLabel
        passageButton.isEnabled = enabled
        // Should it still land in a ⋯ menu, where a custom view shows as nothing.
        if #available(iOS 16.0, *) {
            passageItem.menuRepresentation = UIAction(title: state.passageLabel,
                                                      image: UIImage(systemName: "book")) { [weak self] _ in
                self?.plugin.send("passage")
            }
        }
    }

    /// The passage the reader's bars last showed.
    private var shownPassage: String?

    /// VoiceOver stays on what was tapped, an arrow or +, whose label doesn't
    /// change: it's told what did, and keeps its place.
    private func announceChanges(from previous: ChromeState, to next: ChromeState) {
        if next.passageLabel != shownPassage {
            // The first passage the reader shows is no change.
            if shownPassage != nil { announce(next.passageAccessibilityLabel) }
            shownPassage = next.passageLabel
        } else if let speed = next.autoScroll?.speedAccessibilityLabel,
                  let before = previous.autoScroll?.speedAccessibilityLabel, speed != before {
            announce(speed)
        }
    }

    private func announce(_ text: String) {
        guard UIAccessibility.isVoiceOverRunning else { return }
        UIAccessibility.post(notification: .announcement, argument: text)
    }

    /// The bar shows the symbol; the title names it to VoiceOver and in the
    /// ⋯ menu iOS 27 makes of whatever doesn't fit.
    private func barButton(_ symbol: String, _ label: String, _ action: String) -> UIBarButtonItem {
        UIBarButtonItem(title: label, image: UIImage(systemName: symbol), primaryAction: UIAction { [weak self] _ in
            self?.plugin.send(action)
        })
    }

    /// Back, in the vertical bar: the system bar there has no page under this
    /// one to go back to, so it gets the floating bar's back button as an item.
    private lazy var systemBackItem = barButton("chevron.backward", "Voltar", "back")

    /// The floating top bar's items, set again only when they change: the
    /// vertical bar may have stood in for it in the meantime.
    private func setTopBarItems(_ items: [UINavigationItem], animated: Bool) {
        if topBar.items ?? [] != items {
            topBar.setItems(items, animated: animated)
        }
    }

    /// The system bar's items, where the vertical bar is used.
    private func setSystemBarItems(title: String?, left: [UIBarButtonItem], right: [UIBarButtonItem]) {
        navigationItem.title = title
        if navigationItem.leftBarButtonItems ?? [] != left { navigationItem.leftBarButtonItems = left }
        if navigationItem.rightBarButtonItems ?? [] != right { navigationItem.rightBarButtonItems = right }
    }

    /// The toolbar's width, as it is pinned to the bottom bars' guide.
    private var toolbarWidth: CGFloat { bottomBars.layoutFrame.width }

    /// Liquid Glass toolbar metrics, the same on iOS 26 and 27: the bar's side
    /// margins, two icons sharing a capsule (the arrows), the gap between glass
    /// shapes, and a custom view's padding inside its own glass.
    private enum Glass {
        static let barMargin: CGFloat = 16
        static let pair: CGFloat = 100
        static let gap: CGFloat = 12
        static let padding: CGFloat = 5
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
        // reading (not its play button), but not over a panel, as the other
        // bars don't, nor under a toast.
        if bar === autoScrollControl { return state.inert || autoScrollTucked || toastCoversAutoScroll ? 0 : 1 }
        // Not over a panel, which hides the bars too.
        if bar === compactPassage { return collapsed && !state.inert ? 1 : 0 }
        return collapsed && bar !== searchField ? 0 : 1
    }

    /// The bars are hidden for reading while auto-scroll is paused: its play
    /// button goes with them, as nothing is scrolling to pause.
    private var autoScrollTucked: Bool { collapsed && state.autoScroll?.playing != true }

    /// Slides the top bar off screen and shrinks the toolbar into the small
    /// passage, as Safari's bar does; showing them, the passage grows back into
    /// the toolbar. The page keeps its padding, so the text doesn't move; it
    /// simply shows where the bars were.
    private func animateCollapse(animated: Bool) {
        let motion = !UIAccessibility.isReduceMotionEnabled
        let slide = collapsed && motion
        let morph = passageMorph()
        let changes = {
            self.topBar.transform = slide ? CGAffineTransform(translationX: 0, y: -self.insets.top) : .identity
            self.toolbar.transform = slide ? morph.toolbar : .identity
            self.compactPassage.transform = motion && !self.collapsed ? morph.pill : .identity
            for bar in [self.topBar, self.autoScrollControl] { bar.alpha = self.targetAlpha(bar) }
            self.view.layoutIfNeeded()
        }
        // The bar going fades in the first part of the move, and the one
        // coming in the rest, so the two never show as a double image.
        let fade = { (bar: UIView) in
            let showing = self.targetAlpha(bar) > 0
            UIView.animate(withDuration: showing ? 0.25 : 0.15, delay: showing ? 0.05 : 0,
                           options: [.overrideInheritedDuration, .overrideInheritedCurve, .beginFromCurrentState]) {
                bar.alpha = self.targetAlpha(bar)
            }
        }
        if animated {
            // Lay out what this state update changed first, outside the
            // animation: the speed's new text, the passage's. Laid out inside
            // the animation below, they grew and slid into place, their text
            // cut off on the way, whenever the bars hid or showed.
            view.layoutIfNeeded()
            UIView.animate(withDuration: 0.45, delay: 0, usingSpringWithDamping: 0.85, initialSpringVelocity: 0,
                           options: [.beginFromCurrentState, .allowUserInteraction]) {
                changes()
                fade(self.toolbar)
                fade(self.compactPassage)
            }
        } else {
            changes()
            for bar in [toolbar, compactPassage] { bar.alpha = targetAlpha(bar) }
        }
    }

    /// Transforms that lay the toolbar's passage capsule over the small one,
    /// and the small one over the capsule, so the bar seems to shrink into it
    /// and grow back out of it. About each view's centre, as transforms are.
    private func passageMorph() -> (toolbar: CGAffineTransform, pill: CGAffineTransform) {
        let pill = compactPassage.bounds.size
        let capsule = CGSize(width: passageButton.bounds.width + 2 * Glass.padding, height: toolbar.bounds.height)
        guard pill.width > 0, pill.height > 0, capsule.width > 0, capsule.height > 0 else {
            return (.identity, .identity)
        }
        // Where the capsule's centre is with the toolbar untransformed:
        // centres and bounds ignore transforms.
        let inToolbar = passageButton.convert(CGPoint(x: passageButton.bounds.midX, y: passageButton.bounds.midY),
                                              to: toolbar)
        let bar = toolbar.center
        let passage = CGPoint(x: bar.x + inToolbar.x - toolbar.bounds.midX, y: bar.y + inToolbar.y - toolbar.bounds.midY)
        let target = compactPassage.center
        let sx = pill.width / capsule.width
        let sy = pill.height / capsule.height
        let toolbarMorph = CGAffineTransform(translationX: target.x - bar.x - sx * (passage.x - bar.x),
                                             y: target.y - bar.y - sy * (passage.y - bar.y))
            .scaledBy(x: sx, y: sy)
        let pillMorph = CGAffineTransform(translationX: passage.x - target.x, y: passage.y - target.y)
            .scaledBy(x: 1 / sx, y: 1 / sy)
        return (toolbarMorph, pillMorph)
    }

    // MARK: - Insets

    /// Measured from the layout, not the frames, which the collapse transforms.
    /// Without bars, only the status bar and home indicator cover the page.
    var insets: ChromeInsets {
        let safeArea = view.safeAreaInsets
        // In the vertical bar the system bars are part of the safe area.
        let top = usesVerticalBar ? safeArea.top : topBarOffset + topBar.bounds.height
        switch state.mode {
        case .none:
            return ChromeInsets(top: safeArea.top, bottom: safeArea.bottom)
        case .reader:
            // Auto-scroll's controls float over the text: the page leaves
            // them no room, and the reader moves them off what they cover.
            return ChromeInsets(top: top,
                                bottom: safeArea.bottom + toolbar.bounds.height,
                                collapsed: collapsed)
        case .search:
            return ChromeInsets(top: top, bottom: view.bounds.height - searchField.frame.minY)
        case .page:
            return ChromeInsets(top: top, bottom: safeArea.bottom)
        }
    }

    /// iOS 27.1 places bars vertically here: the iPhone Duo, beside its status
    /// bar.
    private var verticalBarActive: Bool {
        #if canImport(UIKit, _version: 9127.0.85)
        if #available(iOS 27.1, *) {
            return traitCollection.verticalBarEdge != .unspecified
        }
        #endif
        return false
    }

    /// The top bar's distance from the top of the screen: under the status
    /// bar, or, with none above it (a phone turned sideways, or the folded
    /// iPhone Duo, whose status bar runs down its side), the system's side
    /// margin, so the glass sits as far from the top edge as from the side
    /// rather than touching it.
    private var topBarOffset: CGFloat {
        max(view.safeAreaInsets.top, systemMinimumLayoutMargins.leading)
    }

    /// How far in from the safe area's left edge the fold of an iPhone Duo,
    /// folded part way, ends: the bottom bars stay right of it, together.
    /// Apple keeps buttons out of the crease; its toolbars nudge each button
    /// aside on its own, which split the passage from its arrows and left
    /// auto-scroll's speed on the fold. Its region is the crease plus the
    /// margin interactive content keeps.
    private var foldInset: CGFloat {
        #if canImport(UIKit, _version: 9127.0.85)
        if #available(iOS 27.1, *),
           let fold = view.reservedRegions(kind: .division)
            .first(where: { $0.isActive && $0.frame.height > $0.frame.width }) {
            return max(fold.frame.maxX - view.safeAreaLayoutGuide.layoutFrame.minX, 0)
        }
        #endif
        return 0
    }

    private func reportInsets() {
        let current = insets
        guard current != reportedInsets else { return }
        reportedInsets = current
        plugin.sendInsets(current)
    }

    // MARK: - Passage picker

    func presentPicker(_ data: PassagePickerData) {
        let picker = PassagePickerController(data: data) { [weak self] bookId, chapter in
            var payload: [String: Any] = ["bookId": bookId]
            if let chapter { payload["chapter"] = chapter }
            self?.plugin.send("goto", payload)
        }
        presentSheet(picker) { _ in }
    }

    // MARK: - Sheets

    /// A sheet asked for while the last one was on its way out, and its answer.
    private var waitingSheet: (sheet: UIViewController, done: (Bool) -> Void)?

    /// Presents `sheet` now or, while the last one is still on its way out,
    /// once it has gone: a note tapped just after closing the notes used to
    /// show nothing. `done` says whether it came up. It doesn't over a sheet
    /// that stays, nor when the reader drags the closing one back up, and a
    /// sheet asked for later takes a waiting one's place: the web app follows
    /// only the latest.
    private func presentSheet(_ sheet: UIViewController, done: @escaping (Bool) -> Void) {
        guard let current = presentedViewController else {
            present(sheet, animated: true)
            done(true)
            return
        }
        guard current.isBeingDismissed, let coordinator = current.transitionCoordinator else {
            done(false)
            return
        }
        let waiting = waitingSheet != nil
        waitingSheet?.done(false)
        waitingSheet = (sheet, done)
        guard !waiting else { return }
        coordinator.animate(alongsideTransition: nil) { [weak self] _ in
            // On the next turn: UIKit lets go of the old sheet after this.
            DispatchQueue.main.async {
                guard let self, let next = self.waitingSheet else { return }
                self.waitingSheet = nil
                self.presentSheet(next.sheet, done: next.done)
            }
        }
    }

    // MARK: - Toast

    private var toastShowing = false

    /// As a `button`, the toast is one (led by `symbol`), and tapping it
    /// sends toast-action.
    func showToast(_ message: String, button: Bool = false, symbol: String? = nil) {
        view.layoutIfNeeded()
        let onTap: (() -> Void)? = button ? { [weak self] in self?.plugin.send("toast-action") } : nil
        toast.onHide = { [weak self] in self?.setToastShowing(false) }
        placeToast()
        toast.show(message, symbol: symbol, onTap: onTap)
        toast.layoutIfNeeded()
        setToastShowing(true)
    }

    func hideToast() {
        toast.dismissNow()
    }

    /// One glass layer, not two: auto-scroll's controls step aside while a
    /// toast shows where they are.
    private func setToastShowing(_ showing: Bool) {
        toastShowing = showing
        view.layoutIfNeeded()
        fadeAutoScrollForToast()
    }

    /// Also once the reader drops auto-scroll's control onto a toast, or off one.
    private func fadeAutoScrollForToast() {
        UIView.animate(withDuration: 0.25, delay: 0, options: [.beginFromCurrentState]) {
            self.autoScrollControl.alpha = self.targetAlpha(self.autoScrollControl)
        }
    }

    /// The toast and auto-scroll's glass meet. The toast's frame is off while it
    /// scales in, so its size about its centre.
    private var toastCoversAutoScroll: Bool {
        guard toastShowing else { return false }
        let size = toast.bounds.size
        let shown = CGRect(x: toast.center.x - size.width / 2, y: toast.center.y - size.height / 2,
                           width: size.width, height: size.height)
        return shown.insetBy(dx: -8, dy: -8).intersects(autoScrollControl.glassFrame(in: view))
    }

    /// Just above whatever is at the bottom: the toolbar, the search field.
    private func placeToast() {
        toastBottom.constant = -(insets.bottom + 12)
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

    /// See `presentSheet`.
    func presentBookmarks(_ state: BookmarksSheetState, done: @escaping (Bool) -> Void) {
        let bookmarks = BookmarksController(state: state, send: { [weak self] action, color in
            self?.plugin.send(action, ["color": color])
        }, onClose: { [weak self] in
            self?.plugin.send("bookmarks-closed")
        })
        let sheet = UINavigationController(rootViewController: bookmarks)
        // On iPad, a popover from the bookmark button, as Apple's apps show a
        // bar button's panel there: as a sheet the eight ribbons stretched
        // across the screen. Where the width is compact (iPhone, a narrow
        // iPad window) it becomes the sheet.
        sheet.modalPresentationStyle = .popover
        if let popover = sheet.popoverPresentationController {
            if #available(iOS 16.0, *) {
                popover.sourceItem = bookmarksItem
            } else {
                popover.barButtonItem = bookmarksItem
            }
            popover.delegate = self
            let controller = popover.adaptiveSheetPresentationController
            // Just tall enough for the two rows of ribbons and the hint, and
            // the move row when there is one.
            if #available(iOS 16.0, *) {
                controller.detents = [.custom { [weak bookmarks, weak self] _ in
                    bookmarks?.sheetHeight(width: self?.view.bounds.width ?? 0) ?? 300
                }]
            } else {
                controller.detents = [.medium()]
            }
            controller.prefersGrabberVisible = true
        }
        presentSheet(sheet) { [weak self] presented in
            if presented { self?.bookmarksSheet = bookmarks }
            done(presented)
        }
    }

    // A popover closes with a tap outside it, as Apple's do: no ✕ there.
    func presentationController(_ presentationController: UIPresentationController,
                                willPresentWithAdaptiveStyle style: UIModalPresentationStyle,
                                transitionCoordinator: UIViewControllerTransitionCoordinator?) {
        guard let bookmarks = (presentationController.presentedViewController as? UINavigationController)?
            .viewControllers.first as? BookmarksController else { return }
        bookmarks.showsClose = style != .none
    }

    // MARK: - Footnotes

    /// See `presentSheet`.
    func presentFootnotes(_ state: FootnotesSheetState, done: @escaping (Bool) -> Void) {
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
            // Scrolling reads on at either height; the grabber resizes.
            controller.prefersScrollingExpandsWhenScrolledToEdge = false
        }
        presentSheet(sheet, done: done)
    }

    // MARK: - Report

    private(set) weak var reportSheet: ReportController?

    /// See `presentSheet`.
    func presentReport(_ state: ReportSheetState, done: @escaping (Bool) -> Void) {
        let report = ReportController(state: state, onSubmit: { [weak self] topic, details in
            self?.plugin.send("report-submit", ["topic": topic, "details": details])
        }, onClose: { [weak self] in
            self?.plugin.send("report-closed")
        })
        let sheet = UINavigationController(rootViewController: report)
        sheet.modalPresentationStyle = traitCollection.horizontalSizeClass == .regular ? .formSheet : .pageSheet
        presentSheet(sheet) { [weak self] presented in
            if presented { self?.reportSheet = report }
            done(presented)
        }
    }

    // MARK: - Share

    /// See `presentSheet`; `done` says whether something was shared.
    func presentShare(_ share: ShareSheetState, done: @escaping (Bool) -> Void) {
        let sheet = UIActivityViewController(activityItems: share.activityItems, applicationActivities: nil)
        sheet.completionWithItemsHandler = { _, completed, _, _ in done(completed) }
        // From ⋯, whose menu has Partilhar: a popover on iPad, and on iOS 26
        // the iPhone's sheet grows out of it too.
        if let popover = sheet.popoverPresentationController {
            if state.mode == .reader {
                if #available(iOS 16.0, *) {
                    popover.sourceItem = moreItem
                } else {
                    popover.barButtonItem = moreItem
                }
            } else {
                popover.sourceView = view
                popover.sourceRect = CGRect(x: view.bounds.midX, y: view.bounds.midY, width: 0, height: 0)
                popover.permittedArrowDirections = []
            }
        }
        presentSheet(sheet) { presented in
            if !presented { done(false) }
        }
    }

    // MARK: - Onboarding

    /// Whether the sheet came up. UIKit refuses, with only a console warning, a
    /// presentation while another is on its way in or out; `onFinish` then
    /// never runs.
    func presentOnboarding(_ steps: [OnboardingStepData], onFinish: @escaping (Bool, String) -> Void) -> Bool {
        let onboarding = OnboardingController(steps: steps, onFinish: onFinish)
        let sheet = UINavigationController(rootViewController: onboarding)
        sheet.modalPresentationStyle = traitCollection.horizontalSizeClass == .regular ? .formSheet : .pageSheet
        sheet.presentationController?.delegate = onboarding
        var presenter: UIViewController = self
        while let presented = presenter.presentedViewController { presenter = presented }
        guard !presenter.isBeingPresented, !presenter.isBeingDismissed else { return false }
        presenter.present(sheet, animated: true)
        return sheet.presentingViewController != nil
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
        var reading: [UIMenuElement] = [autoScroll]
        if state.canShare {
            reading.append(action("Partilhar", "square.and.arrow.up", "share", send: send))
        }
        var app: [UIMenuElement] = []
        if state.canReport {
            app.append(action("Reportar erro", "exclamationmark.bubble", "report", send: send))
        }
        app.append(action("Como usar a app", "questionmark.circle", "help", send: send))
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

/// A toolbar that centres its passage on its own width, not in its safe area,
/// which the open iPhone Duo's status bar narrows on the right only. UIKit
/// lays the items out between the safe area's sides and the layout margins
/// it takes from them: both have to give, or the passage stays off centre.
/// Each side keeps the narrower inset, so nothing lands under a notch.
private final class CentredToolbar: UIToolbar {
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
