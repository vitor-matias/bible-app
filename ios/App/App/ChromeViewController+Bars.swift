import UIKit

extension ChromeViewController {
    // MARK: - Showing and hiding

    func setShown(_ bar: UIView, _ shown: Bool, animated: Bool) {
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
    func animateCollapse(animated: Bool) {
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
    func passageMorph() -> (toolbar: CGAffineTransform, pill: CGAffineTransform) {
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
            // them no room, and the reader moves them off what they cover. A
            // filter's field stands in for the toolbar, over the keyboard.
            return ChromeInsets(top: top,
                                bottom: state.filterOpen
                                    ? view.bounds.height - searchField.frame.minY
                                    : safeArea.bottom + toolbar.bounds.height,
                                collapsed: collapsed)
        case .search:
            return ChromeInsets(top: top, bottom: view.bounds.height - searchField.frame.minY)
        case .page:
            return ChromeInsets(top: top, bottom: safeArea.bottom)
        }
    }

    /// iOS 27.1 places bars vertically here: the iPhone Duo, beside its status
    /// bar.
    var verticalBarActive: Bool {
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
    var topBarOffset: CGFloat {
        max(view.safeAreaInsets.top, systemMinimumLayoutMargins.leading)
    }

    /// How far in from the safe area's left edge the fold of an iPhone Duo,
    /// folded part way, ends: the bottom bars stay right of it, together.
    /// Apple keeps buttons out of the crease; its toolbars nudge each button
    /// aside on its own, which split the passage from its arrows and left
    /// auto-scroll's speed on the fold. Its region is the crease plus the
    /// margin interactive content keeps.
    var foldInset: CGFloat {
        if #available(iOS 27.1, *),
           let fold = view.reservedRegions(kind: .division)
            .first(where: { $0.isActive && $0.frame.height > $0.frame.width }) {
            return max(fold.frame.maxX - view.safeAreaLayoutGuide.layoutFrame.minX, 0)
        }
        return 0
    }

    func reportInsets() {
        let current = insets
        guard current != reportedInsets else { return }
        reportedInsets = current
        plugin.sendInsets(current)
    }

    // MARK: - Toast

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
    func fadeAutoScrollForToast() {
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
    func placeToast() {
        toastBottom.constant = -(insets.bottom + 12)
    }
}
