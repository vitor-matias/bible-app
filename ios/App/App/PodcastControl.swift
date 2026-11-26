import UIKit

/// The +365 player, a glass card floating over the text just above the
/// toolbar, in auto-scroll's place while the reader listens. It takes the
/// toolbar's passage into its top row, one glass with the player: the
/// passage (still opening the picker) with what plays beside it ("+365 ·
/// Dia 6"), a scrubber, then ⇅ or ✕ … ⏮ ↺15 ▶ ↻15 ⏭ … 1×, where ⏮ ⏭ step
/// through the episode's readings, not the book's chapters. It sits in the
/// toolbar's place while the reader listens, the toolbar gone: the room it
/// frees is the point of joining them. The web app plays the
/// audio; this shows what it sends (PodcastState) and sends the taps back.
/// It doesn't move: the read-along keeps the line being read above it, by
/// the bottom inset the shell reports.
final class PodcastControl: UIView {
    /// The tapped control's action, and the scrubber's seconds for podcast-seek.
    var send: ((String, [String: Any]) -> Void)?
    /// The passage button's tap: the passage picker, as from the toolbar.
    var onPassage: (() -> Void)?

    private let background: UIVisualEffectView
    /// The toolbar's passage, while the card shows it: "Génesis 12".
    private lazy var passageButton: UIButton = {
        var config = UIButton.Configuration.plain()
        config.baseForegroundColor = .label
        config.titleLineBreakMode = .byTruncatingTail
        config.contentInsets = NSDirectionalEdgeInsets(top: 2, leading: 6, bottom: 2, trailing: 6)
        config.titleTextAttributesTransformer = UIConfigurationTextAttributesTransformer { attributes in
            var attributes = attributes
            attributes.font = limitedFont(.systemFont(ofSize: 17, weight: .medium), .body, limit: 23 / 17)
            return attributes
        }
        let button = UIButton(configuration: config, primaryAction: UIAction { [weak self] _ in
            self?.onPassage?()
        })
        button.accessibilityHint = "Escolher livro e capítulo"
        button.showsLargeContentViewer = true
        return button
    }()
    /// What plays besides the passage: "+365 · Dia 6", or the reflection.
    private let context = UILabel()
    private let elapsedLabel = UILabel()
    private let remainingLabel = UILabel()
    private let slider = UISlider()
    private lazy var scrollButton = button("arrow.up.arrow.down", "Deslocar o texto em vez de ouvir", "podcast-scroll")
    /// In ⇅'s slot when there is no ⇅: a plan day ends here.
    private lazy var closeButton = button("xmark", "Terminar", "podcast-close")
    private lazy var previousButton = button("backward.end.fill", "", "podcast-previous")
    private lazy var back15Button = button("gobackward.15", "Recuar 15 segundos", "podcast-skip", ["seconds": -15])
    private lazy var playButton = playToggle()
    private lazy var forward15Button = button("goforward.15", "Avançar 15 segundos", "podcast-skip", ["seconds": 15])
    private lazy var nextButton = button("forward.end.fill", "", "podcast-next")
    /// "1×", "1,25×": a tap goes on to the next speed, round to the slowest.
    private lazy var speedButton: UIButton = {
        var config = UIButton.Configuration.plain()
        config.baseForegroundColor = .label
        config.contentInsets = .zero
        config.titleTextAttributesTransformer = UIConfigurationTextAttributesTransformer { attributes in
            var attributes = attributes
            attributes.font = .monospacedDigitSystemFont(ofSize: 15, weight: .semibold)
            return attributes
        }
        let button = UIButton(configuration: config)
        button.accessibilityLabel = "Velocidade do +365"
        button.accessibilityHint = "Passa para a velocidade seguinte"
        button.showsLargeContentViewer = true
        button.addAction(UIAction { [weak self] _ in self?.send?("podcast-speed", [:]) },
                         for: .primaryActionTriggered)
        return button
    }()

    private var state: PodcastState?
    /// The position shown, as of `since`; while playing it runs on from there
    /// by the rate, as the web sends whole seconds at most once a second.
    private var position: Double = 0
    private var since: CFTimeInterval?
    private var ticker: Timer?
    /// The seek last sent, until the next state: a drag's end comes as both a
    /// touch-up and a last value change.
    private var sought: Float?

    /// Kept from the toolbar's glass below.
    static let gap: CGFloat = 12
    private static let cornerRadius: CGFloat = 26
    private static let playSize: CGFloat = 52

    init() {
        // Not interactive glass, as auto-scroll's is: interactive glass leans
        // toward a finger sliding on it, as one does on the scrubber. Regular
        // glass: clear glass, even tinted, let the text run through the
        // controls (tried Nov 2026).
        if #available(iOS 26.0, *) {
            background = UIVisualEffectView(effect: UIGlassEffect())
        } else {
            background = UIVisualEffectView(effect: UIBlurEffect(style: .systemThickMaterial))
        }
        super.init(frame: .zero)

        background.clipsToBounds = true
        background.layer.cornerRadius = Self.cornerRadius
        background.translatesAutoresizingMaskIntoConstraints = false
        addSubview(background)
        // The glyphs stop growing with the text, as a toolbar's do; a long
        // press shows them large.
        background.addInteraction(UILargeContentViewerInteraction())

        context.font = limitedFont(.systemFont(ofSize: 13, weight: .medium), .footnote, limit: 23 / 17)
        context.textColor = .secondaryLabel
        context.lineBreakMode = .byTruncatingTail
        // The passage keeps its name whole; what plays beside it gives way.
        context.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        // The passage centred on the card; what plays hangs off its right.
        let headerRow = UIView()
        for view in [passageButton, context] as [UIView] {
            view.translatesAutoresizingMaskIntoConstraints = false
            headerRow.addSubview(view)
        }

        // Digits of one width, or the scrubber's ends shift each second.
        for label in [elapsedLabel, remainingLabel] {
            label.font = .monospacedDigitSystemFont(ofSize: 12, weight: .regular)
            label.textColor = .secondaryLabel
            label.isAccessibilityElement = false
            label.setContentHuggingPriority(.required, for: .horizontal)
            label.setContentCompressionResistancePriority(.required, for: .horizontal)
        }
        slider.minimumTrackTintColor = .label
        slider.accessibilityLabel = "Posição no +365"
        slider.addAction(UIAction { [weak self] _ in self?.scrubbed() }, for: .valueChanged)
        slider.addAction(UIAction { [weak self] _ in self?.released() },
                         for: [.touchUpInside, .touchUpOutside, .touchCancel])
        // A tap on the track seeks there, as in podcast apps: not only a drag
        // of the thumb, which UISlider alone asks for.
        slider.addGestureRecognizer(UITapGestureRecognizer(target: self, action: #selector(tappedTrack)))
        let scrubber = UIStackView(arrangedSubviews: [elapsedLabel, slider, remainingLabel])
        scrubber.spacing = 8
        scrubber.alignment = .center

        // Play centres on the card, between ±15 s and ⏮ ⏭; ⇅ (or ✕) and the speed
        // keep to the ends, and a card too narrow pushes the middle aside
        // rather than over them.
        let transport = UIStackView(arrangedSubviews: [previousButton, back15Button, playButton,
                                                       forward15Button, nextButton])
        transport.alignment = .center
        let speed = speedButton
        let buttons = UIView()
        for view in [scrollButton, closeButton, transport, speed] as [UIView] {
            view.translatesAutoresizingMaskIntoConstraints = false
            buttons.addSubview(view)
        }
        let centred = transport.centerXAnchor.constraint(equalTo: buttons.centerXAnchor)
        centred.priority = .defaultHigh

        let column = UIStackView(arrangedSubviews: [headerRow, scrubber, buttons])
        column.axis = .vertical
        column.spacing = 6
        // The passage's 44 pt target takes the card's top margin and the gap
        // below it, so the card hardly grows.
        column.setCustomSpacing(0, after: headerRow)
        column.translatesAutoresizingMaskIntoConstraints = false
        background.contentView.addSubview(column)

        NSLayoutConstraint.activate([
            background.leadingAnchor.constraint(equalTo: leadingAnchor),
            background.trailingAnchor.constraint(equalTo: trailingAnchor),
            background.topAnchor.constraint(equalTo: topAnchor),
            background.bottomAnchor.constraint(equalTo: bottomAnchor),
            column.leadingAnchor.constraint(equalTo: background.contentView.leadingAnchor, constant: 12),
            column.trailingAnchor.constraint(equalTo: background.contentView.trailingAnchor, constant: -12),
            column.topAnchor.constraint(equalTo: background.contentView.topAnchor),
            column.bottomAnchor.constraint(equalTo: background.contentView.bottomAnchor, constant: -8),
            {
                // Centred while it fits; a long name gives way to the left.
                let centre = passageButton.centerXAnchor.constraint(equalTo: headerRow.centerXAnchor)
                centre.priority = .defaultHigh
                return centre
            }(),
            passageButton.leadingAnchor.constraint(greaterThanOrEqualTo: headerRow.leadingAnchor),
            passageButton.heightAnchor.constraint(greaterThanOrEqualToConstant: 44),
            passageButton.topAnchor.constraint(equalTo: headerRow.topAnchor),
            passageButton.bottomAnchor.constraint(equalTo: headerRow.bottomAnchor),
            context.leadingAnchor.constraint(equalTo: passageButton.trailingAnchor, constant: 2),
            context.trailingAnchor.constraint(lessThanOrEqualTo: headerRow.trailingAnchor),
            context.centerYAnchor.constraint(equalTo: passageButton.centerYAnchor),
            scrubber.leadingAnchor.constraint(equalTo: column.leadingAnchor, constant: 4),
            scrubber.trailingAnchor.constraint(equalTo: column.trailingAnchor, constant: -4),
            buttons.heightAnchor.constraint(equalToConstant: Self.playSize),
            scrollButton.leadingAnchor.constraint(equalTo: buttons.leadingAnchor),
            scrollButton.centerYAnchor.constraint(equalTo: buttons.centerYAnchor),
            closeButton.leadingAnchor.constraint(equalTo: buttons.leadingAnchor),
            closeButton.centerYAnchor.constraint(equalTo: buttons.centerYAnchor),
            speed.trailingAnchor.constraint(equalTo: buttons.trailingAnchor),
            speed.centerYAnchor.constraint(equalTo: buttons.centerYAnchor),
            transport.centerYAnchor.constraint(equalTo: buttons.centerYAnchor),
            centred,
            transport.leadingAnchor.constraint(greaterThanOrEqualTo: buttons.leadingAnchor, constant: 44),
            transport.trailingAnchor.constraint(lessThanOrEqualTo: speed.leadingAnchor),
            playButton.widthAnchor.constraint(equalToConstant: Self.playSize),
            playButton.heightAnchor.constraint(equalToConstant: Self.playSize),
        ])
        speedButton.widthAnchor.constraint(greaterThanOrEqualToConstant: 44).isActive = true
        speedButton.heightAnchor.constraint(equalToConstant: 44).isActive = true
        for button in [scrollButton, closeButton, previousButton, back15Button, forward15Button, nextButton] {
            // Just under required: hidden, the stack holds ⏮ ⏭ at zero width.
            let width = button.widthAnchor.constraint(equalToConstant: 42)
            width.priority = .required - 1
            width.isActive = true
            button.heightAnchor.constraint(equalToConstant: 44).isActive = true
        }
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

    /// `passage` and its spoken form are the reader's (ChromeState), shown
    /// here as the toolbar shows them while the card has the passage.
    func configure(_ state: PodcastState, passage: String, passageAccessibility: String, enabled: Bool) {
        let previous = self.state
        self.state = state
        sought = nil
        if passageButton.configuration?.title != passage { passageButton.configuration?.title = passage }
        passageButton.accessibilityLabel = passageAccessibility
        passageButton.largeContentTitle = passage
        passageButton.isEnabled = enabled
        context.text = state.context.map { "· \($0)" }
        context.isHidden = state.context == nil
        context.accessibilityLabel = state.context

        playButton.isEnabled = enabled && (state.playing || state.canPlay)
        playButton.configuration?.image = UIImage(systemName: state.playing ? "pause.fill" : "play.fill")
        playButton.accessibilityLabel = state.playing ? "Pausar o +365" : "Ouvir o +365"
        playButton.largeContentTitle = playButton.accessibilityLabel
        back15Button.isEnabled = enabled && state.loaded
        forward15Button.isEnabled = enabled && state.loaded
        let speed = Self.speedTitle(state.rate)
        if speedButton.configuration?.title != speed { speedButton.configuration?.title = speed }
        speedButton.isEnabled = enabled
        // "Velocidade do +365, 1,25 vezes".
        speedButton.accessibilityValue = state.rateAccessibilityLabel
        speedButton.largeContentTitle = speed
        scrollButton.isHidden = !state.canScroll
        scrollButton.isEnabled = enabled
        closeButton.isHidden = state.canScroll || !state.canClose
        closeButton.isEnabled = enabled
        // Always a pair, so play stays in the middle: the episode's readings,
        // in a plan day or not. One with nowhere to go is disabled, not gone.
        previousButton.isEnabled = enabled && state.previousLabel != nil
        nextButton.isEnabled = enabled && state.nextLabel != nil
        for (button, label) in [(previousButton, state.previousLabel), (nextButton, state.nextLabel)] {
            button.accessibilityLabel = label ?? (button === previousButton ? "Anterior" : "Seguinte")
            button.largeContentTitle = button.accessibilityLabel
        }

        slider.isEnabled = enabled && state.loaded && state.length > 0
        slider.maximumValue = Float(max(state.length, 0))
        if !slider.isTracking {
            let now = CACurrentMediaTime()
            let part = previous.map { $0.caption == state.caption && $0.length == state.length } ?? false
            position = Self.resting(shown: part ? shownPosition(at: now) : nil, elapsed: state.elapsed,
                                    length: state.length)
            since = state.playing ? now : nil
            showPosition(position)
        }
        tick(state.playing)
    }

    /// Where to show the scrubber when a state arrives: the one shown, while
    /// it agrees with the whole seconds sent (running on between them, it is
    /// ahead by under a second), else what was sent.
    static func resting(shown: Double?, elapsed: Double, length: Double) -> Double {
        let value = shown.flatMap { $0 >= elapsed && $0 < elapsed + 1 ? $0 : nil } ?? elapsed
        return min(max(value, 0), max(length, 0))
    }

    /// The position `seconds` after `position` at `rate`, never past the end.
    static func advanced(_ position: Double, by seconds: Double, rate: Double, length: Double) -> Double {
        min(position + max(seconds, 0) * rate, max(length, position))
    }

    /// "3:07".
    static func clock(_ seconds: Double) -> String {
        let whole = Int(max(seconds, 0))
        return "\(whole / 60):" + String(format: "%02d", whole % 60)
    }

    private func shownPosition(at now: CFTimeInterval) -> Double {
        guard let since, let state else { return position }
        return Self.advanced(position, by: now - since, rate: state.rate, length: state.length)
    }

    private func showPosition(_ seconds: Double) {
        let length = state?.length ?? 0
        if !slider.isTracking { slider.value = Float(seconds) }
        elapsedLabel.text = Self.clock(seconds)
        // Rounded up, so the two add up to the length.
        remainingLabel.text = "−" + Self.clock((length - seconds).rounded(.up))
        slider.accessibilityValue = "\(Self.clock(seconds)) de \(Self.clock(length))"
    }

    /// The podcast gone: the scrubber stops running on.
    func stop() {
        tick(false)
    }

    /// While playing the scrubber runs on by itself between updates.
    private func tick(_ playing: Bool) {
        guard playing != (ticker != nil) else { return }
        ticker?.invalidate()
        ticker = nil
        guard playing else { return }
        let timer = Timer(timeInterval: 0.25, repeats: true) { [weak self] _ in
            guard let self, !self.slider.isTracking else { return }
            self.showPosition(self.shownPosition(at: CACurrentMediaTime()))
        }
        RunLoop.main.add(timer, forMode: .common)
        ticker = timer
    }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        if window == nil { tick(false) } else { tick(state?.playing == true) }
    }

    /// Dragged, the times follow the thumb; set without a drag (VoiceOver's
    /// swipe up or down), it seeks at once, as no touch ends it.
    private func scrubbed() {
        showPosition(Double(slider.value))
        if !slider.isTracking { seek() }
    }

    private func released() {
        seek()
    }

    @objc private func tappedTrack(_ tap: UITapGestureRecognizer) {
        guard slider.isEnabled, slider.maximumValue > slider.minimumValue else { return }
        let share = Self.trackShare(at: tap.location(in: slider).x,
                                    of: slider.trackRect(forBounds: slider.bounds))
        slider.value = slider.minimumValue + share * (slider.maximumValue - slider.minimumValue)
        seek()
    }

    /// How far along the track a tap at `x` is, from 0 to 1.
    static func trackShare(at x: CGFloat, of track: CGRect) -> Float {
        guard track.width > 0 else { return 0 }
        return Float(min(1, max(0, (x - track.minX) / track.width)))
    }

    /// Runs on from where it was let go, rather than springing back to the
    /// last state until the web's answer arrives.
    private func seek() {
        guard slider.value != sought else { return }
        sought = slider.value
        let seconds = Double(slider.value)
        position = seconds
        since = state?.playing == true ? CACurrentMediaTime() : nil
        showPosition(seconds)
        send?("podcast-seek", ["seconds": seconds])
    }

    /// "1×", "1⅒×", "1¼×", "1½×", "¾×": fractions, which read at a glance on
    /// a small button; anything else with the decimal comma. Rounded first:
    /// 1.1 − 1 is not quite 0.1 in floating point.
    static func speedTitle(_ rate: Double) -> String {
        let whole = rate.rounded(.down)
        let part = ((rate - whole) * 100).rounded() / 100
        let fractions: [Double: String] = [0: "", 0.1: "⅒", 0.25: "¼", 0.5: "½", 0.75: "¾"]
        if let fraction = fractions[part] {
            return (whole == 0 && !fraction.isEmpty ? "" : String(Int(whole))) + fraction + "×"
        }
        let formatter = NumberFormatter()
        formatter.locale = Locale(identifier: "pt_PT")
        formatter.minimumFractionDigits = 0
        formatter.maximumFractionDigits = 2
        return (formatter.string(from: NSNumber(value: rate)) ?? "\(rate)") + "×"
    }

    private func button(_ symbol: String, _ label: String, _ action: String,
                        _ extra: [String: Any] = [:]) -> UIButton {
        var config = UIButton.Configuration.plain()
        config.image = UIImage(systemName: symbol)
        config.preferredSymbolConfigurationForImage = UIImage.SymbolConfiguration(pointSize: 17, weight: .medium)
        config.baseForegroundColor = .label
        config.contentInsets = .zero
        let button = UIButton(configuration: config)
        button.accessibilityLabel = label
        button.largeContentTitle = label
        button.showsLargeContentViewer = true
        button.addAction(UIAction { [weak self] _ in self?.send?(action, extra) }, for: .primaryActionTriggered)
        return button
    }

    /// Filled in the text colour, inverted, as the app's main buttons are;
    /// plain fill rather than glass, already on the card's glass.
    private func playToggle() -> UIButton {
        var config = UIButton.Configuration.filled()
        config.image = UIImage(systemName: "play.fill")
        config.preferredSymbolConfigurationForImage = UIImage.SymbolConfiguration(pointSize: 22, weight: .semibold)
        config.baseBackgroundColor = ChromeViewController.selectionFill
        config.baseForegroundColor = ChromeViewController.onSelection
        config.cornerStyle = .capsule
        config.contentInsets = .zero
        let button = UIButton(configuration: config)
        button.accessibilityLabel = "Ouvir o +365"
        button.largeContentTitle = button.accessibilityLabel
        button.showsLargeContentViewer = true
        button.addAction(UIAction { [weak self] _ in self?.send?("podcast-toggle", [:]) }, for: .primaryActionTriggered)
        return button
    }
}
