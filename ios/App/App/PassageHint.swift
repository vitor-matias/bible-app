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
    /// How long the tip stays if the reader does nothing.
    private static let passageHintSeconds = 6.0

    /// A tip above the toolbar, from the passage. Not while another sheet is
    /// up, the bars are away, or the passage lives in the Duo's vertical bar,
    /// where there's no room above it.
    func presentPassageHint() {
        guard passageHintView == nil, presentedViewController == nil, state.mode == .reader,
              !collapsed, !usesVerticalBar, passageButton.window != nil else { return }
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
        DispatchQueue.main.asyncAfter(deadline: .now() + Self.passageHintSeconds) { [weak self, weak hint] in
            guard let hint, self?.passageHintView === hint else { return }
            self?.dismissPassageHint()
        }
    }

    /// Away at once on a tap of the passage, a sheet, the bars hiding or the
    /// chapter changing: it is only worth showing while it points at something.
    func dismissPassageHint() {
        guard let hint = passageHintView else { return }
        passageHintView = nil
        UIView.animate(withDuration: 0.2, animations: { hint.alpha = 0 }, completion: { _ in hint.removeFromSuperview() })
    }
}
