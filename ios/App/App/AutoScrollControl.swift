import UIKit

/// Auto-scroll's controls, in the bottom bars' trailing corner. Paused, they
/// are one glass circle, ▶; playing, it grows into a capsule, [− 1/2 + | ⏸],
/// with the pause where play was. The speed shows only while playing, when it
/// can be judged. There is no close button: ⋯ hides auto-scroll, as it showed it.
///
/// The view itself spans the bottom bars, a toolbar tall, so the controller
/// places it as it does the toolbar. Only the glass takes touches; the rest of
/// it passes them to the page.
final class AutoScrollControl: UIView {
    /// The tapped control's action: auto-scroll-toggle, -slower or -faster.
    var send: ((String) -> Void)?

    private let background: UIVisualEffectView
    private let row = UIStackView()
    private lazy var slowerButton = button("minus", "Diminuir velocidade", "auto-scroll-slower")
    private lazy var fasterButton = button("plus", "Aumentar velocidade", "auto-scroll-faster")
    private lazy var playButton = button("play.fill", "Iniciar", "auto-scroll-toggle")
    private let speedLabel = SpeedLabel()
    private let divider = UIView()
    /// Shown only while playing.
    private var speedViews: [UIView] { [slowerButton, speedLabel, fasterButton, divider] }
    private var playing = false

    /// The glass's height, and the circle's diameter.
    private static let height: CGFloat = 48
    /// From the bottom bars' edge, as the toolbar's glass is.
    private static let margin: CGFloat = 16

    init() {
        if #available(iOS 26.0, *) {
            let glass = UIGlassEffect()
            glass.isInteractive = true
            background = UIVisualEffectView(effect: glass)
        } else {
            background = UIVisualEffectView(effect: UIBlurEffect(style: .systemThickMaterial))
        }
        super.init(frame: .zero)

        background.clipsToBounds = true
        background.translatesAutoresizingMaskIntoConstraints = false
        addSubview(background)
        // The glyphs stop growing with the text, as a toolbar's do; a long
        // press shows them large.
        background.addInteraction(UILargeContentViewerInteraction())

        // As the passage button's text, with digits of one width.
        speedLabel.font = limitedFont(.monospacedDigitSystemFont(ofSize: 17, weight: .medium), .body,
                                      limit: barTextScaleLimit)
        speedLabel.adjustsFontForContentSizeCategory = true
        speedLabel.textColor = .label
        speedLabel.textAlignment = .center
        speedLabel.showsLargeContentViewer = true
        speedLabel.accessibilityLabel = "Velocidade"
        divider.backgroundColor = .separator

        row.axis = .horizontal
        row.alignment = .center
        row.translatesAutoresizingMaskIntoConstraints = false
        for view in speedViews + [playButton] { row.addArrangedSubview(view) }
        // Narrowing as the capsule closes, they're cut off rather than drawn
        // over each other.
        for view in speedViews { view.clipsToBounds = true }
        background.contentView.addSubview(row)

        NSLayoutConstraint.activate([
            background.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -Self.margin),
            background.centerYAnchor.constraint(equalTo: centerYAnchor),
            background.heightAnchor.constraint(equalToConstant: Self.height),
            row.leadingAnchor.constraint(equalTo: background.contentView.leadingAnchor),
            row.trailingAnchor.constraint(equalTo: background.contentView.trailingAnchor),
            row.topAnchor.constraint(equalTo: background.contentView.topAnchor),
            row.bottomAnchor.constraint(equalTo: background.contentView.bottomAnchor),
            // Play is the circle while paused, the pause the capsule's end.
            playButton.widthAnchor.constraint(equalToConstant: Self.height),
            divider.heightAnchor.constraint(equalToConstant: 24),
        ])
        // Just under required: hidden, the stack holds these at zero width,
        // and that must win without breaking a constraint.
        for (view, width) in [(slowerButton, 44), (fasterButton, 44), (divider, 1)] as [(UIView, CGFloat)] {
            let constraint = view.widthAnchor.constraint(equalToConstant: width)
            constraint.priority = .required - 1
            constraint.isActive = true
        }
        for button in [slowerButton, fasterButton, playButton] {
            button.heightAnchor.constraint(equalToConstant: Self.height).isActive = true
        }
        showSpeed(false)
        fadeSpeed(false)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

    override func layoutSubviews() {
        super.layoutSubviews()
        background.layer.cornerRadius = Self.height / 2
    }

    /// Touches outside the glass reach the page, its rounded ends' corners
    /// included: clipping draws the circle, but hit-testing is by rectangle.
    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        let inGlass = UIBezierPath(roundedRect: background.frame, cornerRadius: Self.height / 2)
        guard inGlass.contains(point) else { return nil }
        return super.hitTest(point, with: event)
    }

    func configure(_ state: AutoScrollState, enabled: Bool) {
        slowerButton.isEnabled = enabled && state.canSlower
        fasterButton.isEnabled = enabled && state.canFaster
        playButton.isEnabled = enabled
        speedLabel.text = state.speedLabel
        speedLabel.largeContentTitle = state.speedLabel
        speedLabel.accessibilityValue = state.speedAccessibilityLabel
        playButton.configuration?.image = UIImage(systemName: state.playing ? "pause.fill" : "play.fill")
        playButton.accessibilityLabel = state.playing ? "Pausar" : "Iniciar"
        playButton.largeContentTitle = playButton.accessibilityLabel
        guard state.playing != playing else { return }
        playing = state.playing
        // The speed's new text first, outside the animation, inside which it
        // would grow in cut off.
        layoutIfNeeded()
        // Animated only on screen: shown again, it starts as a circle at once.
        guard !isHidden && alpha > 0 && !UIAccessibility.isReduceMotionEnabled else {
            showSpeed(playing)
            fadeSpeed(playing)
            return
        }
        // The speed fades in once the capsule has nearly opened, and out
        // before it closes: in step with it, "1" and + ran into each other
        // on the way.
        UIView.animate(withDuration: 0.4, delay: playing ? 0 : 0.08, usingSpringWithDamping: 0.8,
                       initialSpringVelocity: 0, options: [.beginFromCurrentState, .allowUserInteraction]) {
            self.showSpeed(self.playing)
        }
        UIView.animate(withDuration: playing ? 0.2 : 0.1, delay: playing ? 0.15 : 0,
                       options: [.beginFromCurrentState, .allowUserInteraction]) {
            self.fadeSpeed(self.playing)
        }
    }

    private func showSpeed(_ shown: Bool) {
        // VoiceOver on − or + when the speed goes (auto-scroll stopped by
        // itself) moves to play, rather than to nothing.
        let focusLeaving = !shown && speedViews.contains { $0.accessibilityElementIsFocused() }
        for view in speedViews { view.isHidden = !shown }
        layoutIfNeeded()
        if focusLeaving {
            UIAccessibility.post(notification: .layoutChanged, argument: playButton)
        }
    }

    private func fadeSpeed(_ shown: Bool) {
        for view in speedViews { view.alpha = shown ? 1 : 0 }
    }

    private func button(_ symbol: String, _ label: String, _ action: String) -> UIButton {
        var config = UIButton.Configuration.plain()
        config.image = UIImage(systemName: symbol)
        config.preferredSymbolConfigurationForImage = UIImage.SymbolConfiguration(pointSize: 17, weight: .medium)
        config.baseForegroundColor = .label
        let button = UIButton(configuration: config)
        button.accessibilityLabel = label
        button.largeContentTitle = label
        button.showsLargeContentViewer = true
        button.addAction(UIAction { [weak self] _ in self?.send?(action) }, for: .primaryActionTriggered)
        return button
    }
}

/// As wide as the widest speed, "3.75", whatever it shows: − beside it stays
/// put as the speed changes.
private final class SpeedLabel: UILabel {
    override var intrinsicContentSize: CGSize {
        let size = super.intrinsicContentSize
        let widest = ("0.00" as NSString).size(withAttributes: [.font: font as Any]).width
        return CGSize(width: max(size.width, ceil(widest)), height: size.height)
    }
}
