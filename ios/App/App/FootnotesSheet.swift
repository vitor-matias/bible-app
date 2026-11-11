import UIKit
import Capacitor

/// A verse's footnotes, built by the web app (native-footnotes.service.ts).
struct FootnotesSheetState {
    struct Part {
        let text: String
        /// Set on a reference: the index the web app opens it by.
        let link: Int?
    }

    struct Note {
        let reference: String
        let parts: [Part]
    }

    /// The verse, e.g. "Mateus 11,3".
    let title: String
    /// The reader's text size, 1 = 100%, which already counts the iPhone's
    /// own text size.
    let fontScale: CGFloat
    /// Set as the reader's text is: ragged-right or justified. Nil from a
    /// web app that doesn't say; then by the size, as before.
    let raggedText: Bool?
    /// Hyphenated as the reader's text: unless the reader chose ragged-right.
    /// Nil from a web app that doesn't say: hyphenated, as before.
    let hyphenate: Bool?
    let notes: [Note]

    /// Ragged-right: as the reader's text, else past 180%, where a justified
    /// line of a handful of words spreads them, even letter by letter.
    var ragged: Bool { raggedText ?? (fontScale > 1.8) }

    init(_ call: CAPPluginCall) {
        title = call.getString("title", "")
        fontScale = CGFloat(call.getDouble("fontScale") ?? 1)
        raggedText = call.getBool("raggedText")
        hyphenate = call.getBool("hyphenate")
        notes = (call.getArray("notes", JSObject.self) ?? []).map { note in
            Note(reference: note["reference"] as? String ?? "",
                 parts: ((note["parts"] as? JSArray) ?? []).compactMap { $0 as? JSObject }.map { part in
                     Part(text: part["text"] as? String ?? "",
                          link: (part["link"] as? NSNumber)?.intValue)
                 })
        }
    }
}

/// The notes as reading text: the system serif, justified and hyphenated like
/// the reader, at the reader's footnote size. References are links; tapping
/// one opens it and closes the sheet. The text can be selected and copied.
final class FootnotesController: UIViewController, UITextViewDelegate {
    private let state: FootnotesSheetState
    private let onLink: (Int) -> Void
    private let onClose: () -> Void
    /// The way back that this sheet covers, to offer here, and what taps it.
    private let wayBack: (message: String, symbol: String?)?
    private let onWayBack: () -> Void
    private var wayBackButton: UIButton?
    /// Keeps it with the sheet, as it comes up, is dragged and goes.
    private var wayBackFollower: CADisplayLink?
    private let textView = UITextView()
    private static let linkScheme = "nota"

    init(state: FootnotesSheetState, wayBack: (message: String, symbol: String?)? = nil,
         onLink: @escaping (Int) -> Void, onWayBack: @escaping () -> Void = {}, onClose: @escaping () -> Void) {
        self.state = state
        self.wayBack = wayBack
        self.onLink = onLink
        self.onWayBack = onWayBack
        self.onClose = onClose
        super.init(nibName: nil, bundle: nil)
        title = state.title
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = sheetBackground
        navigationItem.rightBarButtonItem = closeButton(for: self)

        textView.isEditable = false
        textView.isSelectable = true
        textView.backgroundColor = .clear
        textView.adjustsFontForContentSizeCategory = true
        textView.textContainerInset = UIEdgeInsets(top: 8, left: 20, bottom: 32, right: 20)
        textView.delegate = self
        textView.linkTextAttributes = [
            .foregroundColor: UIColor.label,
            .underlineStyle: NSUnderlineStyle.single.rawValue,
        ]
        textView.attributedText = attributedNotes()
        textView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(textView)
        NSLayoutConstraint.activate([
            textView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            // The safe area, not the edges: on the folded iPhone Duo, turned
            // sideways, Close runs down the side, over the start of the note.
            textView.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor),
            textView.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor),
            textView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])
    }

    // The toast is under this sheet until it has come up, and again as it goes:
    // the capsule shows only in between, so that the two are never both in view.

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        fadeWayBack(to: 1)
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        fadeWayBack(to: 0)
    }

    private func fadeWayBack(to alpha: CGFloat) {
        UIView.animate(withDuration: 0.15, delay: 0, options: [.beginFromCurrentState]) {
            self.wayBackButton?.alpha = alpha
        }
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        guard let wayBack, wayBackButton == nil,
              let container = navigationController?.presentationController?.containerView else { return }
        let button = wayBackCapsule(wayBack)
        button.frame.size = Self.wayBackSize(button, room: container.bounds.width - 48)
        button.alpha = 0
        container.addSubview(button)
        wayBackButton = button
        followSheet()
        let follower = CADisplayLink(target: self, selector: #selector(followSheet))
        follower.add(to: .main, forMode: .common)
        wayBackFollower = follower
    }

    /// The toast's capsule, in the sheet's container: the toast itself is under
    /// this sheet, as anything in the page is.
    private func wayBackCapsule(_ wayBack: (message: String, symbol: String?)) -> UIButton {
        var config: UIButton.Configuration
        if #available(iOS 26.0, *) {
            config = .glass()
        } else {
            config = .plain()
            config.background.visualEffect = UIBlurEffect(style: .systemThickMaterial)
        }
        config.cornerStyle = .capsule
        config.baseForegroundColor = .label
        config.title = wayBack.message
        config.image = wayBack.symbol.flatMap { UIImage(systemName: $0) }
        config.imagePadding = 8
        config.preferredSymbolConfigurationForImage = UIImage.SymbolConfiguration(textStyle: .subheadline, scale: .medium)
        // Wraps at the largest text sizes, as the toast does.
        config.titleLineBreakMode = .byWordWrapping
        config.titleTextAttributesTransformer = UIConfigurationTextAttributesTransformer { attributes in
            var attributes = attributes
            attributes.font = limitedFont(.systemFont(ofSize: 15, weight: .semibold), .subheadline)
            return attributes
        }
        config.contentInsets = NSDirectionalEdgeInsets(top: 12, leading: 16, bottom: 12, trailing: 16)
        let goBack = { [weak self] in
            self?.onWayBack()
            self?.dismiss(animated: true)
        }
        let button = UIButton(configuration: config, primaryAction: UIAction { _ in goBack() })
        // VoiceOver stays within the sheet, a modal view: it has it on the notes.
        textView.accessibilityCustomActions = [
            UIAccessibilityCustomAction(name: wayBack.message) { _ in
                goBack()
                return true
            },
        ]
        // The notes' last line can scroll clear of it, where it's over them.
        textView.textContainerInset.bottom = 88
        return button
    }

    /// Its one line, or, where that is wider than `room`, its wrapped lines at that width.
    static func wayBackSize(_ button: UIButton, room: CGFloat) -> CGSize {
        let size = button.sizeThatFits(CGSize(width: room, height: .greatestFiniteMagnitude))
        return CGSize(width: min(size.width, room), height: size.height)
    }

    /// Above the sheet, over the dimmed page, so that it covers no notes; with
    /// no room there, as the notes fill the screen, at the sheet's foot.
    static func wayBackCenter(sheet: CGRect, size: CGSize, container: CGRect, safeArea: UIEdgeInsets) -> CGPoint {
        let gap: CGFloat = 12
        let above = sheet.minY - gap - size.height
        let top = above >= safeArea.top + gap
            ? above
            : min(sheet.maxY, container.maxY) - safeArea.bottom - gap - size.height
        return CGPoint(x: sheet.midX, y: top + size.height / 2)
    }

    /// From what is on screen, not where the animation is heading.
    @objc private func followSheet() {
        guard let button = wayBackButton, let container = button.superview,
              let sheet = navigationController?.presentationController?.presentedView else { return }
        let containerLayer = container.layer.presentation() ?? container.layer
        let sheetLayer = sheet.layer.presentation() ?? sheet.layer
        let frame = sheetLayer.convert(sheetLayer.bounds, to: containerLayer)
        button.center = Self.wayBackCenter(sheet: frame, size: button.bounds.size,
                                           container: container.bounds, safeArea: container.safeAreaInsets)
    }

    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        if isBeingDismissed || navigationController?.isBeingDismissed == true {
            wayBackFollower?.invalidate()
            wayBackFollower = nil
            wayBackButton?.removeFromSuperview()
            wayBackButton = nil
            onClose()
        }
    }

    private func attributedNotes() -> NSAttributedString {
        // From the standard body size: the reader's scale already counts the
        // iPhone's text size, and Dynamic Type on top would count it twice.
        let body = UIFont.preferredFont(forTextStyle: .body,
                                        compatibleWith: UITraitCollection(preferredContentSizeCategory: .large))
        let size = body.pointSize * 1.06 * state.fontScale
        let serif = body.fontDescriptor.withDesign(.serif) ?? body.fontDescriptor
        let regular = UIFont(descriptor: serif, size: size)
        let bold = UIFont(descriptor: serif.withSymbolicTraits(.traitBold) ?? serif, size: size * 1.04)

        let paragraph = NSMutableParagraphStyle()
        paragraph.alignment = state.ragged ? .natural : .justified
        paragraph.hyphenationFactor = state.hyphenate ?? true ? 0.9 : 0
        paragraph.lineSpacing = size * 0.28
        paragraph.paragraphSpacing = size * 0.9
        let base: [NSAttributedString.Key: Any] = [
            .font: regular,
            .foregroundColor: UIColor.label,
            .paragraphStyle: paragraph,
            // Portuguese hyphenation.
            NSAttributedString.Key(kCTLanguageAttributeName as String): "pt-PT",
        ]

        let text = NSMutableAttributedString()
        for (index, note) in state.notes.enumerated() {
            if index > 0 { text.append(NSAttributedString(string: "\n", attributes: base)) }
            var marker = base
            marker[.font] = bold
            // The marker carries its own full stop ("3.").
            text.append(NSAttributedString(string: "\(note.reference)  ", attributes: marker))
            for part in note.parts {
                var attributes = base
                if let link = part.link {
                    attributes[.link] = URL(string: "\(Self.linkScheme)://\(link)")
                }
                text.append(NSAttributedString(string: part.text, attributes: attributes))
            }
        }
        return text
    }

    // MARK: - Links

    private func openLink(_ url: URL) -> Bool {
        guard url.scheme == Self.linkScheme, let index = url.host.flatMap(Int.init) else { return false }
        onLink(index)
        dismiss(animated: true)
        return true
    }

    @available(iOS 17.0, *)
    func textView(_ textView: UITextView, primaryActionFor textItem: UITextItem,
                  defaultAction: UIAction) -> UIAction? {
        guard case let .link(url) = textItem.content, url.scheme == Self.linkScheme else { return defaultAction }
        return UIAction { [weak self] _ in _ = self?.openLink(url) }
    }

    /// No Open, Copy Link or Share for a nota:// link, which means nothing
    /// outside this sheet (before iOS 17, shouldInteractWith refuses it).
    @available(iOS 17.0, *)
    func textView(_ textView: UITextView, menuConfigurationFor textItem: UITextItem,
                  defaultMenu: UIMenu) -> UITextItem.MenuConfiguration? {
        if case let .link(url) = textItem.content, url.scheme == Self.linkScheme { return nil }
        return UITextItem.MenuConfiguration(menu: defaultMenu)
    }

    func textView(_ textView: UITextView, shouldInteractWith url: URL, in characterRange: NSRange,
                  interaction: UITextItemInteraction) -> Bool {
        if url.scheme == Self.linkScheme {
            if interaction == .invokeDefaultAction { _ = openLink(url) }
            return false
        }
        return true
    }
}
