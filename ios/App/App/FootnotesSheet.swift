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
    /// The reader's footnote text size, 1 = 100%.
    let fontScale: CGFloat
    let notes: [Note]

    init(_ call: CAPPluginCall) {
        title = call.getString("title", "")
        fontScale = CGFloat(call.getDouble("fontScale") ?? 1)
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
    private let textView = UITextView()
    private static let linkScheme = "nota"

    init(state: FootnotesSheetState, onLink: @escaping (Int) -> Void, onClose: @escaping () -> Void) {
        self.state = state
        self.onLink = onLink
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
            textView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            textView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            textView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])
    }

    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        if isBeingDismissed || navigationController?.isBeingDismissed == true {
            onClose()
        }
    }

    private func attributedNotes() -> NSAttributedString {
        let body = UIFont.preferredFont(forTextStyle: .body)
        let size = body.pointSize * 1.06 * state.fontScale
        let serif = body.fontDescriptor.withDesign(.serif) ?? body.fontDescriptor
        let regular = UIFont(descriptor: serif, size: size)
        let bold = UIFont(descriptor: serif.withSymbolicTraits(.traitBold) ?? serif, size: size * 1.04)

        let paragraph = NSMutableParagraphStyle()
        paragraph.alignment = .justified
        paragraph.hyphenationFactor = 0.9
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

    func textView(_ textView: UITextView, shouldInteractWith url: URL, in characterRange: NSRange,
                  interaction: UITextItemInteraction) -> Bool {
        if url.scheme == Self.linkScheme {
            if interaction == .invokeDefaultAction { _ = openLink(url) }
            return false
        }
        return true
    }
}
