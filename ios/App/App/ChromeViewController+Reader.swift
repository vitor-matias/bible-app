import UIKit

extension ChromeViewController {
    func configureReader(_ state: ChromeState) {
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

        filterItem.isEnabled = enabled
        previousItem.isEnabled = enabled && state.canGoPrevious
        nextItem.isEnabled = enabled && state.canGoNext
        fittedToolbarWidth = toolbarWidth
        // A list's filter takes the arrows' place, on a page without them.
        let arrows = state.chapterNavigation ? [previousItem, nextItem]
            : state.filterPlaceholder != nil ? [filterItem] : []
        let room = toolbarWidth - 2 * (Glass.barMargin + Glass.padding)
            - (arrows.isEmpty || usesVerticalBar ? 0 : Glass.pair + Glass.gap)
        configurePassage(state, enabled: enabled, room: room)
        // The bar reaches into a wider left inset: a space as wide keeps the
        // arrows out of it, while the passage, between flexible spaces, still
        // centres on the bar. A new item, so the toolbar lays out again.
        if leadingInsetSpace.width != toolbarLeadingInset {
            leadingInsetSpace = .fixedSpace(toolbarLeadingInset)
        }
        // In the vertical bar the arrows join its column. The passage stays in
        // the floating toolbar, which centres it on the screen, under the page;
        // the system toolbar would centre it in its own strip, off the text.
        let leading = usesVerticalBar ? [] : (toolbarLeadingInset > 0 ? [leadingInsetSpace] : []) + arrows
        let floating = leading + [passageSpaces[0], passageItem, passageSpaces[1]]
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
    /// too, into a ⋯ menu (27). The arrows and the name must always show, so
    /// the name gives way, never them: don't lean on the ⋯ menu instead.
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

    /// VoiceOver stays on what was tapped, an arrow or +, whose label doesn't
    /// change: it's told what did, and keeps its place.
    func announceChanges(from previous: ChromeState, to next: ChromeState) {
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
    func barButton(_ symbol: String, _ label: String, _ action: String) -> UIBarButtonItem {
        UIBarButtonItem(title: label, image: UIImage(systemName: symbol), primaryAction: UIAction { [weak self] _ in
            self?.plugin.send(action)
        })
    }

    /// The floating top bar's items, set again only when they change: the
    /// vertical bar may have stood in for it in the meantime.
    func setTopBarItems(_ items: [UINavigationItem], animated: Bool) {
        if topBar.items ?? [] != items {
            topBar.setItems(items, animated: animated)
        }
    }

    /// The system bar's items, where the vertical bar is used.
    func setSystemBarItems(title: String?, left: [UIBarButtonItem], right: [UIBarButtonItem]) {
        navigationItem.title = title
        if navigationItem.leftBarButtonItems ?? [] != left { navigationItem.leftBarButtonItems = left }
        if navigationItem.rightBarButtonItems ?? [] != right { navigationItem.rightBarButtonItems = right }
    }

    /// The toolbar's width, as it is pinned to the bottom bars' guide.
    var toolbarWidth: CGFloat { bottomBars.layoutFrame.width }

    /// Liquid Glass toolbar metrics, the same on iOS 26 and 27: the bar's side
    /// margins, two icons sharing a capsule (the arrows), the gap between glass
    /// shapes, and a custom view's padding inside its own glass.
    enum Glass {
        static let barMargin: CGFloat = 16
        static let pair: CGFloat = 100
        static let gap: CGFloat = 12
        static let padding: CGFloat = 5
    }
}
