import UIKit

/// A short message in a glass capsule, floating above the bottom bar: the iOS
/// counterpart of the web app's snackbar (toast.service.ts). A plain one fades
/// out by itself, or when tapped. One with a button (e.g. "Voltar") stays
/// until its button or its close button is tapped, or another toast replaces it.
final class ToastView: UIView {
    private let label = UILabel()
    private let actionButton = UIButton(configuration: .plain())
    private let closeButton = UIButton(configuration: .plain())
    private let background: UIVisualEffectView
    private var hideWork: DispatchWorkItem?
    private var onAction: (() -> Void)?
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
        let padding = NSDirectionalEdgeInsets(top: 6, leading: 6, bottom: 6, trailing: 6)
        var action = UIButton.Configuration.plain()
        action.baseForegroundColor = .label
        action.contentInsets = padding
        action.titleTextAttributesTransformer = UIConfigurationTextAttributesTransformer { attributes in
            var attributes = attributes
            attributes.font = UIFontMetrics(forTextStyle: .subheadline).scaledFont(for: .systemFont(ofSize: 15, weight: .semibold))
            return attributes
        }
        actionButton.configuration = action
        actionButton.addTarget(self, action: #selector(actionTapped), for: .primaryActionTriggered)

        var close = UIButton.Configuration.plain()
        close.image = UIImage(systemName: "xmark",
                              withConfiguration: UIImage.SymbolConfiguration(textStyle: .footnote, scale: .medium))
        close.baseForegroundColor = .secondaryLabel
        close.contentInsets = padding
        closeButton.configuration = close
        closeButton.accessibilityLabel = "Fechar"
        closeButton.addTarget(self, action: #selector(dismissNow), for: .primaryActionTriggered)

        let row = UIStackView(arrangedSubviews: [label, actionButton, closeButton])
        row.alignment = .center
        row.spacing = 4
        row.setCustomSpacing(12, after: label)
        row.translatesAutoresizingMaskIntoConstraints = false
        background.contentView.addSubview(row)
        label.setContentHuggingPriority(.defaultLow, for: .horizontal)
        for button in [actionButton, closeButton] {
            button.setContentHuggingPriority(.required, for: .horizontal)
            button.setContentCompressionResistancePriority(.required, for: .horizontal)
        }

        rowMargins = [
            background.contentView.trailingAnchor.constraint(equalTo: row.trailingAnchor, constant: 20),
            row.topAnchor.constraint(equalTo: background.contentView.topAnchor, constant: 12),
            background.contentView.bottomAnchor.constraint(equalTo: row.bottomAnchor, constant: 12),
        ]
        NSLayoutConstraint.activate(rowMargins + [
            background.leadingAnchor.constraint(equalTo: leadingAnchor),
            background.trailingAnchor.constraint(equalTo: trailingAnchor),
            background.topAnchor.constraint(equalTo: topAnchor),
            background.bottomAnchor.constraint(equalTo: bottomAnchor),
            row.leadingAnchor.constraint(equalTo: background.contentView.leadingAnchor, constant: 20),
        ])
        let tap = UITapGestureRecognizer(target: self, action: #selector(tapped))
        addGestureRecognizer(tap)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

    override func layoutSubviews() {
        super.layoutSubviews()
        // A capsule while it is one line; rounded corners once it wraps.
        background.layer.cornerRadius = min(bounds.height / 2, 24)
        background.layer.cornerCurve = .continuous
    }

    /// `action` names the button; `onAction` runs when it is tapped.
    func show(_ message: String, action: String? = nil, onAction: (() -> Void)? = nil) {
        hideWork?.cancel()
        hideWork = nil
        label.text = message
        actionButton.configuration?.title = action
        self.onAction = action == nil ? nil : onAction
        let actionable = action != nil
        actionButton.isHidden = !actionable
        closeButton.isHidden = !actionable
        label.textAlignment = actionable ? .natural : .center
        let trailing: CGFloat = actionable ? 14 : 20
        let vertical: CGFloat = actionable ? 6 : 12
        rowMargins[0].constant = trailing
        rowMargins[1].constant = vertical
        rowMargins[2].constant = vertical
        // A plain toast reads as one element; with buttons, VoiceOver reaches each.
        isAccessibilityElement = !actionable
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
        UIAccessibility.post(notification: .announcement,
                             argument: actionable ? "\(message) \(action ?? "")" : message)
        guard !actionable else { return }

        // Long enough to read: about a second and a half plus a word a quarter-second.
        let words = message.split(separator: " ").count
        let work = DispatchWorkItem { [weak self] in self?.dismissNow() }
        hideWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + min(5, 1.6 + Double(words) * 0.25), execute: work)
    }

    /// Tapping a plain toast puts it away; one with buttons waits for them.
    @objc private func tapped() {
        if onAction == nil { dismissNow() }
    }

    @objc private func actionTapped() {
        let action = onAction
        dismissNow()
        action?()
    }

    @objc func dismissNow() {
        hideWork?.cancel()
        hideWork = nil
        onAction = nil
        guard !isHidden else { return }
        UIView.animate(withDuration: 0.25, delay: 0, options: [.beginFromCurrentState]) {
            self.alpha = 0
        } completion: { _ in
            if self.alpha == 0 { self.isHidden = true }
        }
    }
}
