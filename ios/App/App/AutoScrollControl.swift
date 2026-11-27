import UIKit

/// Auto-scroll's controls, floating over the text. Paused, they are one glass
/// circle, ▶; playing, it grows leftward into a capsule, [− + | ⏸], with the
/// pause where play was. Slower and faster show only while playing, when the
/// speed can be judged, by eye: the number says nothing a reader needs, and
/// only VoiceOver reads it. There is no close button: ⋯ hides auto-scroll, as
/// it showed it. Where +365 reads the chapter a 🎧 leads, playing or paused,
/// to listen instead: [🎧 | ▶], [🎧 − + | ⏸].
///
/// The reader drags it wherever they like, and it stays there, then and on
/// later launches. The view itself spans the reading area, between the bars;
/// only the glass takes touches, and the rest passes them to the page.
final class AutoScrollControl: UIView {
    /// The tapped control's action: auto-scroll-toggle, -slower, -faster or
    /// -listen.
    var send: ((String) -> Void)?
    /// The reader has dropped it in a new place.
    var onMoved: (() -> Void)?

    private let background: UIVisualEffectView
    /// Carries the glass, and is what a drag moves. Interactive glass leans
    /// toward a finger sliding off it, judged from where it sits in its
    /// superview, its own transform left out: moved itself, it took the whole
    /// drag for such a slide, ran ahead of the finger (about 1.4 times as far)
    /// and snapped back on release.
    private let mover = UIView()
    private let row = UIStackView()
    private lazy var slowerButton = button("minus", "Diminuir velocidade", "auto-scroll-slower")
    private lazy var fasterButton = button("plus", "Aumentar velocidade", "auto-scroll-faster")
    private lazy var playButton = button("play.fill", "Iniciar", "auto-scroll-toggle")
    private lazy var listenButton = button("headphones", "Ouvir o +365 em vez de deslocar", "auto-scroll-listen")
    private let divider = UIView()
    /// Left of play: 🎧 where +365 reads the chapter, − + while playing, and
    /// the divider with either.
    private var sideViews: [UIView] { [listenButton, slowerButton, fasterButton, divider] }
    private var playing = false
    private var canListen = false

    /// Where the reader left the circle: its centre, across and down the
    /// space it can take, each from 0 to 1.
    private var position: CGPoint
    private var glassRight: NSLayoutConstraint!
    private var glassY: NSLayoutConstraint!

    /// The glass's height, and the circle's diameter.
    private static let height: CGFloat = 48
    /// Kept from the sides, as the toolbar's glass is.
    private static let margin: CGFloat = 16
    /// Kept from the bars above and below.
    private static let gap: CGFloat = 12
    private static let positionKeys = (x: "autoScrollControlX", y: "autoScrollControlY")

    init() {
        if #available(iOS 26.0, *) {
            let glass = UIGlassEffect()
            glass.isInteractive = true
            background = UIVisualEffectView(effect: glass)
        } else {
            background = UIVisualEffectView(effect: UIBlurEffect(style: .systemThickMaterial))
        }
        // Bottom right until the reader moves it.
        let defaults = UserDefaults.standard
        position = CGPoint(x: defaults.object(forKey: Self.positionKeys.x) as? Double ?? 1,
                           y: defaults.object(forKey: Self.positionKeys.y) as? Double ?? 1)
        super.init(frame: .zero)

        mover.translatesAutoresizingMaskIntoConstraints = false
        addSubview(mover)
        background.clipsToBounds = true
        background.translatesAutoresizingMaskIntoConstraints = false
        mover.addSubview(background)
        // The glyphs stop growing with the text, as a toolbar's do; a long
        // press shows them large.
        background.addInteraction(UILargeContentViewerInteraction())

        divider.backgroundColor = .separator

        row.axis = .horizontal
        row.alignment = .center
        row.translatesAutoresizingMaskIntoConstraints = false
        for view in sideViews + [playButton] { row.addArrangedSubview(view) }
        // Narrowing as the capsule closes, they're cut off rather than drawn
        // over each other.
        for view in sideViews { view.clipsToBounds = true }
        background.contentView.addSubview(row)

        // The circle's right edge where the reader put it. Near the left side
        // the capsule is pushed right, rather than off the screen or squeezed
        // (the buttons' widths, at 999, win).
        glassRight = mover.rightAnchor.constraint(equalTo: leftAnchor)
        glassRight.priority = UILayoutPriority(700)
        glassY = mover.centerYAnchor.constraint(equalTo: topAnchor)
        NSLayoutConstraint.activate([
            glassRight,
            glassY,
            mover.leftAnchor.constraint(greaterThanOrEqualTo: leftAnchor, constant: Self.margin),
            mover.rightAnchor.constraint(lessThanOrEqualTo: rightAnchor, constant: -Self.margin),
            background.leftAnchor.constraint(equalTo: mover.leftAnchor),
            background.rightAnchor.constraint(equalTo: mover.rightAnchor),
            background.topAnchor.constraint(equalTo: mover.topAnchor),
            background.bottomAnchor.constraint(equalTo: mover.bottomAnchor),
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
        for (view, width) in [(listenButton, 44), (slowerButton, 44), (fasterButton, 44), (divider, 1)]
            as [(UIView, CGFloat)] {
            let constraint = view.widthAnchor.constraint(equalToConstant: width)
            constraint.priority = .required - 1
            constraint.isActive = true
        }
        for button in [listenButton, slowerButton, fasterButton, playButton] {
            button.heightAnchor.constraint(equalToConstant: Self.height).isActive = true
        }
        showSides()
        fadeSides()

        background.addGestureRecognizer(UIPanGestureRecognizer(target: self, action: #selector(dragged(_:))))
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

    override func layoutSubviews() {
        // In the same place relative to the reading area, whatever its size:
        // turned, say.
        let centre = circleCentre(at: position)
        glassRight.constant = centre.x + Self.height / 2
        glassY.constant = centre.y
        super.layoutSubviews()
        background.layer.cornerRadius = Self.height / 2
    }

    /// The space the circle's centre can take: the reading area, less margins.
    private var circleRange: CGRect {
        let inset = Self.height / 2
        let range = bounds.inset(by: UIEdgeInsets(top: Self.gap + inset, left: Self.margin + inset,
                                                  bottom: Self.gap + inset, right: Self.margin + inset))
        return CGRect(origin: range.origin,
                      size: CGSize(width: max(range.width, 0), height: max(range.height, 0)))
    }

    private func circleCentre(at position: CGPoint) -> CGPoint {
        let range = circleRange
        return CGPoint(x: range.minX + range.width * position.x, y: range.minY + range.height * position.y)
    }

    /// Where play shows now, a drag's transform included.
    private var playCentre: CGPoint {
        playButton.convert(CGPoint(x: playButton.bounds.midX, y: playButton.bounds.midY), to: self)
    }

    /// Follows the finger, and stays where it lets go, kept inside the
    /// reading area.
    @objc private func dragged(_ drag: UIPanGestureRecognizer) {
        let moved = drag.translation(in: self)
        switch drag.state {
        case .changed:
            mover.transform = CGAffineTransform(translationX: moved.x, y: moved.y)
        case .ended, .cancelled:
            let dropped = playCentre
            let range = circleRange
            position = CGPoint(x: range.width > 0 ? min(max((dropped.x - range.minX) / range.width, 0), 1) : 1,
                               y: range.height > 0 ? min(max((dropped.y - range.minY) / range.height, 0), 1) : 1)
            UserDefaults.standard.set(Double(position.x), forKey: Self.positionKeys.x)
            UserDefaults.standard.set(Double(position.y), forKey: Self.positionKeys.y)

            // Laid out in its new place, and shown from where it was let go:
            // only a drop past the edges moves it, back inside.
            mover.transform = .identity
            setNeedsLayout()
            layoutIfNeeded()
            let placed = playCentre
            mover.transform = CGAffineTransform(translationX: dropped.x - placed.x, y: dropped.y - placed.y)
            let still = UIAccessibility.isReduceMotionEnabled
            UIView.animate(withDuration: 0.4, delay: 0, usingSpringWithDamping: still ? 1 : 0.8,
                           initialSpringVelocity: 0, options: [.beginFromCurrentState, .allowUserInteraction]) {
                self.mover.transform = .identity
            }
            onMoved?()
        default:
            break
        }
    }

    /// Where the glass rests, in `view`'s coordinates: not where a drag, or
    /// the settling after one, has it for the moment.
    func glassFrame(in view: UIView) -> CGRect {
        let size = mover.bounds.size
        let resting = CGRect(x: mover.center.x - size.width / 2, y: mover.center.y - size.height / 2,
                             width: size.width, height: size.height)
        return convert(resting, to: view)
    }

    /// Touches outside the glass reach the page, its rounded ends' corners
    /// included: clipping draws the circle, but hit-testing is by rectangle.
    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        let inGlass = UIBezierPath(roundedRect: mover.frame, cornerRadius: Self.height / 2)
        guard inGlass.contains(point) else { return nil }
        return super.hitTest(point, with: event)
    }

    func configure(_ state: AutoScrollState, enabled: Bool) {
        listenButton.isEnabled = enabled
        slowerButton.isEnabled = enabled && state.canSlower
        fasterButton.isEnabled = enabled && state.canFaster
        // Pause always; play not at the page's end, with nothing left to play.
        playButton.isEnabled = enabled && (state.playing || state.canPlay)
        // "Aumentar velocidade, meia linha por segundo".
        slowerButton.accessibilityValue = state.speedAccessibilityLabel
        fasterButton.accessibilityValue = state.speedAccessibilityLabel
        playButton.configuration?.image = UIImage(systemName: state.playing ? "pause.fill" : "play.fill")
        playButton.accessibilityLabel = state.playing ? "Pausar" : "Iniciar"
        playButton.largeContentTitle = playButton.accessibilityLabel
        guard state.playing != playing || state.canListen != canListen else { return }
        playing = state.playing
        canListen = state.canListen
        // Anything else this update changed first, outside the animation.
        layoutIfNeeded()
        // Animated only on screen: shown again, it starts as a circle at once.
        guard !isHidden && alpha > 0 && !UIAccessibility.isReduceMotionEnabled else {
            showSides()
            fadeSides()
            return
        }
        // − and + fade in once the capsule has nearly opened, and out before
        // it closes: in step with it, they ran into each other on the way.
        UIView.animate(withDuration: 0.4, delay: playing ? 0 : 0.08, usingSpringWithDamping: 0.8,
                       initialSpringVelocity: 0, options: [.beginFromCurrentState, .allowUserInteraction]) {
            self.showSides()
        }
        UIView.animate(withDuration: playing ? 0.2 : 0.1, delay: playing ? 0.15 : 0,
                       options: [.beginFromCurrentState, .allowUserInteraction]) {
            self.fadeSides()
        }
    }

    private func shows(_ view: UIView) -> Bool {
        if view === listenButton { return canListen }
        if view === divider { return playing || canListen }
        return playing
    }

    private func showSides() {
        // VoiceOver on − or + when the speed goes (auto-scroll stopped by
        // itself) moves to play, rather than to nothing.
        let focusLeaving = sideViews.contains { !shows($0) && $0.accessibilityElementIsFocused() }
        // Only those that change: a stack view counts each hide made inside
        // an animation, and one hidden twice stayed hidden when shown once
        // (− + gone after 🎧 went, paused).
        for view in sideViews where view.isHidden == shows(view) { view.isHidden = !shows(view) }
        layoutIfNeeded()
        if focusLeaving {
            UIAccessibility.post(notification: .layoutChanged, argument: playButton)
        }
    }

    private func fadeSides() {
        for view in sideViews { view.alpha = shows(view) ? 1 : 0 }
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
