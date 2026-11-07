import UIKit

extension ChromeViewController {
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

    // MARK: - Bookmarks

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
        sheet.completionWithItemsHandler = { activity, completed, _, error in
            // A cancelled target (Mail closed unsent) returns to the sheet, where
            // another can still share; a failed one answers at once.
            if !completed && activity != nil && error == nil { return }
            done(completed)
        }
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

    /// Queued as the other sheets are (see `presentSheet`), as on Android;
    /// `presented` says whether it came up, and `onFinish` runs only if it did.
    func presentOnboarding(
        _ steps: [OnboardingStepData],
        presented: @escaping (Bool) -> Void,
        onFinish: @escaping (Bool, String) -> Void
    ) {
        let onboarding = OnboardingController(
            steps: steps, barButton: { [weak self] in self?.barReplica($0) }, onFinish: onFinish)
        let sheet = UINavigationController(rootViewController: onboarding)
        sheet.modalPresentationStyle = traitCollection.horizontalSizeClass == .regular ? .formSheet : .pageSheet
        sheet.presentationController?.delegate = onboarding
        presentSheet(sheet, done: presented)
    }

    /// The bar button an onboarding page names, in a toolbar of its own, so
    /// that the system draws it as it draws the real one (Liquid Glass on
    /// iOS 26): the passage's title in the passage button's configuration,
    /// the real items' symbols.
    func barReplica(_ key: String) -> UIView? {
        let item: UIBarButtonItem
        switch key {
        case "passage":
            var config = passageButton.configuration ?? .plain()
            // What the bars show, whether or not they are showing it now.
            config.title = state.passageLabel.isEmpty ? "Génesis 1" : state.passageLabel
            item = UIBarButtonItem(customView: UIButton(configuration: config))
        case "search":
            item = UIBarButtonItem(image: readerSearchItem.image)
        case "text":
            item = UIBarButtonItem(image: fontItem.image)
        default:
            return nil
        }
        let bar = UIToolbar()
        bar.items = [.flexibleSpace(), item, .flexibleSpace()]
        return bar
    }
}
