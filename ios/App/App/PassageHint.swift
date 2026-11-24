import UIKit

/// The tip over the toolbar's passage button, for a reader who has never
/// opened the books: it says the passage is a button. Not a popover: those
/// take the first tap, and this one is meant to be tapped through to the
/// button under it.
final class PassageHintView: UIVisualEffectView {
    static let text = "Toque para escolher o livro"

    init() {
        if #available(iOS 26.0, *) {
            super.init(effect: UIGlassEffect())
        } else {
            super.init(effect: UIBlurEffect(style: .systemThickMaterial))
        }
        let label = UILabel()
        label.text = Self.text
        label.font = limitedFont(.systemFont(ofSize: 15, weight: .medium), .subheadline)
        label.adjustsFontForContentSizeCategory = true
        label.numberOfLines = 0
        label.textAlignment = .center
        label.textColor = .label
        label.translatesAutoresizingMaskIntoConstraints = false
        contentView.addSubview(label)
        NSLayoutConstraint.activate([
            label.topAnchor.constraint(equalTo: contentView.topAnchor, constant: 10),
            label.bottomAnchor.constraint(equalTo: contentView.bottomAnchor, constant: -10),
            label.leadingAnchor.constraint(equalTo: contentView.leadingAnchor, constant: 16),
            label.trailingAnchor.constraint(equalTo: contentView.trailingAnchor, constant: -16),
        ])
        clipsToBounds = true
        isUserInteractionEnabled = false
        // The button under it already says what it does to VoiceOver.
        isAccessibilityElement = false
        accessibilityElementsHidden = true
        alpha = 0
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

    override func layoutSubviews() {
        super.layoutSubviews()
        layer.cornerRadius = bounds.height / 2
    }
}

extension ChromeViewController {
    /// Asked for by the web app, for a reader who has never opened the books:
    /// the tip stays until they tap the passage. It goes while the passage
    /// does (a sheet over it, the bars hiding) and comes back with it.
    func showPassageHint() {
        passageHintPending = true
        presentPassageHint()
    }

    /// A tip above the toolbar, from the passage. Not while another sheet is
    /// up, the bars are away, or the passage lives in the Duo's vertical bar,
    /// where there's no room above it.
    func presentPassageHint() {
        guard passageHintPending, passageHintView == nil, presentedViewController == nil, state.mode == .reader,
              !state.filterOpen, !state.collapsed, !state.inert, !toastShowing, !collapsed, !usesVerticalBar, passageButton.window != nil else { return }
        let hint = PassageHintView()
        hint.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(hint)
        NSLayoutConstraint.activate([
            hint.centerXAnchor.constraint(equalTo: passageButton.centerXAnchor),
            hint.bottomAnchor.constraint(equalTo: toolbar.topAnchor, constant: -8),
            hint.leadingAnchor.constraint(greaterThanOrEqualTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 16),
            hint.trailingAnchor.constraint(lessThanOrEqualTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -16),
        ])
        passageHintView = hint
        view.layoutIfNeeded()

        // A critically damped spring that rises from the passage; reduced
        // motion keeps the fade alone.
        let still = UIAccessibility.isReduceMotionEnabled
        if !still { hint.transform = CGAffineTransform(translationX: 0, y: 6).scaledBy(x: 0.94, y: 0.94) }
        UIView.animate(withDuration: 0.4, delay: 0, usingSpringWithDamping: 1, initialSpringVelocity: 0) {
            hint.alpha = 1
            hint.transform = .identity
        }
    }

    /// Off the screen for now: the bars hiding, a sheet, the chapter changing.
    /// It is still wanted, and comes back (see `apply`).
    func dismissPassageHint() {
        guard let hint = passageHintView else { return }
        passageHintView = nil
        UIView.animate(withDuration: 0.2, animations: { hint.alpha = 0 }, completion: { _ in hint.removeFromSuperview() })
    }

    /// The reader used the passage: no more tip.
    func endPassageHint() {
        passageHintPending = false
        dismissPassageHint()
    }
}
