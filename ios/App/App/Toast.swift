import UIKit

/// A short message in a glass capsule, floating above the bottom bar: the iOS
/// counterpart of the web app's snackbar (toast.service.ts). It has no button;
/// it fades out by itself, or when tapped.
final class ToastView: UIView {
    private let label = UILabel()
    private let background: UIVisualEffectView
    private var hideWork: DispatchWorkItem?

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
        label.translatesAutoresizingMaskIntoConstraints = false
        background.contentView.addSubview(label)

        NSLayoutConstraint.activate([
            background.leadingAnchor.constraint(equalTo: leadingAnchor),
            background.trailingAnchor.constraint(equalTo: trailingAnchor),
            background.topAnchor.constraint(equalTo: topAnchor),
            background.bottomAnchor.constraint(equalTo: bottomAnchor),
            label.leadingAnchor.constraint(equalTo: background.contentView.leadingAnchor, constant: 20),
            label.trailingAnchor.constraint(equalTo: background.contentView.trailingAnchor, constant: -20),
            label.topAnchor.constraint(equalTo: background.contentView.topAnchor, constant: 12),
            label.bottomAnchor.constraint(equalTo: background.contentView.bottomAnchor, constant: -12),
        ])
        addGestureRecognizer(UITapGestureRecognizer(target: self, action: #selector(dismissNow)))
        isAccessibilityElement = true
        accessibilityTraits = .staticText
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

    override func layoutSubviews() {
        super.layoutSubviews()
        // A capsule while it is one line; rounded corners once it wraps.
        background.layer.cornerRadius = min(bounds.height / 2, 24)
        background.layer.cornerCurve = .continuous
    }

    func show(_ message: String) {
        hideWork?.cancel()
        label.text = message
        accessibilityLabel = message
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

        // Long enough to read: about a second and a half plus a word a quarter-second.
        let words = message.split(separator: " ").count
        let work = DispatchWorkItem { [weak self] in self?.dismissNow() }
        hideWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + min(5, 1.6 + Double(words) * 0.25), execute: work)
    }

    @objc func dismissNow() {
        hideWork?.cancel()
        hideWork = nil
        guard !isHidden else { return }
        UIView.animate(withDuration: 0.25, delay: 0, options: [.beginFromCurrentState]) {
            self.alpha = 0
        } completion: { _ in
            if self.alpha == 0 { self.isHidden = true }
        }
    }
}
