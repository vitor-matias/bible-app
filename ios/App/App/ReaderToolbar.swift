import UIKit

/// The reader's bottom bar: ‹ › and the passage, each in a glass capsule, where
/// UIToolbar drew them (48 pt tall on the safe area's bottom, 16 pt in from the
/// sides, the passage centred). The glass is our own, in one glass container,
/// so that while the bars hide for reading the passage's capsule shrinks into a
/// small one in the home indicator's strip and the arrows' melts into it, as
/// Safari's address bar does. A toolbar's glass can't be animated so.
///
/// The view runs from the bar's top to the screen's bottom; only the glass
/// takes touches, and the rest passes them to the page.
final class ReaderToolbar: UIView {
    /// The bar's height over the safe area's bottom, as UIToolbar's.
    static let barHeight: CGFloat = 48

    /// Liquid Glass toolbar metrics, the same on iOS 26 and 27: the bar's side
    /// margins, two icons sharing a capsule (the arrows), the gap between glass
    /// shapes, and a custom view's padding inside its own glass.
    enum Glass {
        static let barMargin: CGFloat = 16
        static let pair: CGFloat = 100
        static let gap: CGFloat = 12
        static let padding: CGFloat = 5
    }

    /// The small capsule: Safari's is about this tall, its text 13 pt to 17.
    private enum Compact {
        static let height: CGFloat = 30
        static let scale: CGFloat = 13 / 17
        static let padding: CGFloat = 12
    }

    let previousButton: UIButton
    let nextButton: UIButton
    let passageButton: UIButton

    /// The passage's widest; past it, its name is cut short.
    var passageRoom: CGFloat = 0 { didSet { setNeedsLayout() } }
    var chapterNavigation = true { didSet { setNeedsLayout() } }
    /// The small capsule's distance from the screen's bottom.
    var compactInset: CGFloat = 8 { didSet { setNeedsLayout() } }
    private(set) var collapsed = false

    private let container: UIVisualEffectView
    private let arrows: UIVisualEffectView
    private let passage: UIVisualEffectView

    init(previous: UIButton, next: UIButton, passage passageButton: UIButton) {
        previousButton = previous
        nextButton = next
        self.passageButton = passageButton
        if #available(iOS 26.0, *) {
            container = UIVisualEffectView(effect: UIGlassContainerEffect())
        } else {
            container = UIVisualEffectView(effect: nil)
        }
        arrows = UIVisualEffectView(effect: Self.glass())
        passage = UIVisualEffectView(effect: Self.glass())
        super.init(frame: .zero)

        addSubview(container)
        for glass in [arrows, passage] {
            glass.clipsToBounds = true
            container.contentView.addSubview(glass)
        }
        arrows.contentView.addSubview(previous)
        arrows.contentView.addSubview(next)
        passage.contentView.addSubview(passageButton)
        // The glyphs and the name stop growing with the text, as a toolbar's
        // do; a long press shows them large.
        addInteraction(UILargeContentViewerInteraction())
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

    /// Glass that answers a press, or, before iOS 26, a blur.
    private static func glass() -> UIVisualEffect {
        if #available(iOS 26.0, *) {
            let glass = UIGlassEffect()
            glass.isInteractive = true
            return glass
        }
        return UIBlurEffect(style: .systemThickMaterial)
    }

    /// Call inside an animation block, followed by a layout pass, to animate.
    /// The arrows' glass goes as it reaches the small capsule, dissolving into
    /// the passage's in the container.
    func setCollapsed(_ collapsed: Bool) {
        self.collapsed = collapsed
        arrows.effect = collapsed ? nil : Self.glass()
        // The glyphs go before their glass reaches the passage, and come back
        // once it has left it.
        UIView.animate(withDuration: collapsed ? 0.12 : 0.2, delay: collapsed ? 0 : 0.15,
                       options: [.overrideInheritedDuration, .overrideInheritedCurve, .beginFromCurrentState]) {
            for button in [self.previousButton, self.nextButton] { button.alpha = collapsed ? 0 : 1 }
        }
        setNeedsLayout()
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        container.frame = bounds
        let height = Self.barHeight
        // Frames, not constraints, so that a layout pass in an animation block
        // moves the glass and its contents together.
        let nameWidth = min(passageButton.intrinsicContentSize.width, max(passageRoom, 0))
        passageButton.transform = .identity
        passageButton.bounds = CGRect(x: 0, y: 0, width: nameWidth, height: height)
        let compactWidth = nameWidth * Compact.scale + 2 * Compact.padding
        let compact = CGRect(x: bounds.midX - compactWidth / 2,
                             y: bounds.height - compactInset - Compact.height,
                             width: compactWidth, height: Compact.height)
        arrows.isHidden = !chapterNavigation
        let arrowsFrame = CGRect(x: Glass.barMargin, y: 0, width: Glass.pair, height: height)
        if collapsed {
            passage.frame = compact
            arrows.frame = compact
            passageButton.transform = CGAffineTransform(scaleX: Compact.scale, y: Compact.scale)
        } else {
            let width = nameWidth + 2 * Glass.padding
            var x = bounds.midX - width / 2
            if chapterNavigation { x = max(x, arrowsFrame.maxX + Glass.gap) }
            passage.frame = CGRect(x: x, y: 0, width: width, height: height)
            arrows.frame = arrowsFrame
        }
        passageButton.center = CGPoint(x: passage.bounds.midX, y: passage.bounds.midY)
        let half = Glass.pair / 2
        previousButton.frame = CGRect(x: 0, y: 0, width: half, height: height)
        nextButton.frame = CGRect(x: half, y: 0, width: half, height: height)
        for glass in [arrows, passage] { glass.layer.cornerRadius = glass.bounds.height / 2 }
    }

    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        let hit = super.hitTest(point, with: event)
        return hit === self || hit === container || hit === container.contentView ? nil : hit
    }
}
