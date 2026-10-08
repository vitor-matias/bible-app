import UIKit

/// A short message in a glass capsule, floating above the bottom bar: the iOS
/// counterpart of the web app's snackbar (toast.service.ts). A plain one fades
/// out by itself, or when tapped.
///
/// A toast can also be a button, as Books' "Back to Page" is: the whole
/// capsule is the target, its message the label (e.g. "Voltar para João 1,18"),
/// with a close button beside it. It stays until one of them is tapped or
/// another toast replaces it.
final class ToastView: UIView {
    private let label = UILabel()
    private let mainButton = UIButton(configuration: .plain())
    private let closeButton = UIButton(configuration: .plain())
    private let background: UIVisualEffectView
    private var hideWork: DispatchWorkItem?
    private var onTap: (() -> Void)?
    /// Trailing, top and bottom: the buttons' padding stands in for these.
    private var rowMargins: [NSLayoutConstraint] = []

    init() {
        if #available(iOS 26.0, *) {
            background = UIVisualEffectView(effect: UIGlassEffect())
        } else {
            background = UIVisualEffectView(effect: UIBlurEffect(style: .systemThickMaterial))
        }
        super.init(frame: .zero)
        alpha = 0
        isHidden = true

        background.clipsToBounds = true
        background.translatesAutoresizingMaskIntoConstraints = false
        addSubview(background)

        label.font = .preferredFont(forTextStyle: .subheadline)
        label.adjustsFontForContentSizeCategory = true
        label.textColor = .label
        label.textAlignment = .center
        label.numberOfLines = 2

        // Padded, for a comfortable target; the row's margins allow for it.
        let padding = NSDirectionalEdgeInsets(top: 8, leading: 6, bottom: 8, trailing: 6)
        var main = UIButton.Configuration.plain()
        main.baseForegroundColor = .label
        main.contentInsets = padding
        main.imagePadding = 8
        main.preferredSymbolConfigurationForImage = UIImage.SymbolConfiguration(textStyle: .subheadline, scale: .medium)
        main.titleLineBreakMode = .byTruncatingTail
        main.titleTextAttributesTransformer = UIConfigurationTextAttributesTransformer { attributes in
            var attributes = attributes
            attributes.font = UIFontMetrics(forTextStyle: .subheadline).scaledFont(for: .systemFont(ofSize: 15, weight: .semibold))
            return attributes
        }
        mainButton.configuration = main
        mainButton.addTarget(self, action: #selector(tapped), for: .primaryActionTriggered)

        var close = UIButton.Configuration.plain()
        close.image = UIImage(systemName: "xmark",
                              withConfiguration: UIImage.SymbolConfiguration(textStyle: .footnote, scale: .medium))
        close.baseForegroundColor = .secondaryLabel
        close.contentInsets = padding
        closeButton.configuration = close
        closeButton.accessibilityLabel = "Fechar"
        closeButton.addTarget(self, action: #selector(dismissNow), for: .primaryActionTriggered)

        let row = UIStackView(arrangedSubviews: [label, mainButton, closeButton])
        row.alignment = .center
        row.spacing = 4
        row.translatesAutoresizingMaskIntoConstraints = false
        background.contentView.addSubview(row)
        closeButton.setContentHuggingPriority(.required, for: .horizontal)
        closeButton.setContentCompressionResistancePriority(.required, for: .horizontal)

        rowMargins = [
            background.contentView.trailingAnchor.constraint(equalTo: row.trailingAnchor, constant: 20),
            row.topAnchor.constraint(equalTo: background.contentView.topAnchor, constant: 12),
            background.contentView.bottomAnchor.constraint(equalTo: row.bottomAnchor, constant: 12),
            row.leadingAnchor.constraint(equalTo: background.contentView.leadingAnchor, constant: 20),
        ]
        NSLayoutConstraint.activate(rowMargins + [
            background.leadingAnchor.constraint(equalTo: leadingAnchor),
            background.trailingAnchor.constraint(equalTo: trailingAnchor),
            background.topAnchor.constraint(equalTo: topAnchor),
            background.bottomAnchor.constraint(equalTo: bottomAnchor),
        ])
        // The capsule's margins count as the button too.
        addGestureRecognizer(UITapGestureRecognizer(target: self, action: #selector(tapped)))
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

    override func layoutSubviews() {
        super.layoutSubviews()
        // A capsule while it is one line; rounded corners once it wraps.
        background.layer.cornerRadius = min(bounds.height / 2, 24)
        background.layer.cornerCurve = .continuous
    }

    /// With `onTap`, the toast is a button labelled `message`, led by `symbol`.
    func show(_ message: String, symbol: String? = nil, onTap: (() -> Void)? = nil) {
        hideWork?.cancel()
        hideWork = nil
        self.onTap = onTap
        let button = onTap != nil
        label.text = message
        label.isHidden = button
        mainButton.configuration?.title = message
        mainButton.configuration?.image = symbol.flatMap { UIImage(systemName: $0) }
        mainButton.isHidden = !button
        closeButton.isHidden = !button
        // The glass answers the touch, as a glass button's does.
        if #available(iOS 26.0, *) {
            let glass = UIGlassEffect()
            glass.isInteractive = button
            background.effect = glass
        }
        // The buttons' padding stands in for the margins.
        rowMargins[0].constant = button ? 14 : 20
        rowMargins[1].constant = button ? 4 : 12
        rowMargins[2].constant = button ? 4 : 12
        rowMargins[3].constant = button ? 14 : 20
        // Read as one element, or as its two buttons.
        isAccessibilityElement = !button
        accessibilityLabel = message
        accessibilityTraits = .staticText
        isHidden = false
        superview?.bringSubviewToFront(self)

        let still = UIAccessibility.isReduceMotionEnabled
        if alpha == 0 && !still {
            transform = CGAffineTransform(translationX: 0, y: 10).scaledBy(x: 0.94, y: 0.94)
        }
        UIView.animate(withDuration: 0.45, delay: 0, usingSpringWithDamping: 0.8, initialSpringVelocity: 0,
                       options: [.beginFromCurrentState, .allowUserInteraction]) {
            self.alpha = 1
            self.transform = .identity
        }
        UIAccessibility.post(notification: .announcement, argument: message)
        guard !button else { return }

        // Long enough to read: about a second and a half plus a word a quarter-second.
        let words = message.split(separator: " ").count
        let work = DispatchWorkItem { [weak self] in self?.dismissNow() }
        hideWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + min(5, 1.6 + Double(words) * 0.25), execute: work)
    }

    /// A plain toast goes away; a button runs its action and goes away.
    @objc private func tapped() {
        let action = onTap
        dismissNow()
        action?()
    }

    @objc func dismissNow() {
        hideWork?.cancel()
        hideWork = nil
        onTap = nil
        guard !isHidden else { return }
        UIView.animate(withDuration: 0.25, delay: 0, options: [.beginFromCurrentState]) {
            self.alpha = 0
        } completion: { _ in
            if self.alpha == 0 { self.isHidden = true }
        }
    }
}
