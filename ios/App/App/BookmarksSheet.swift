import UIKit
import Capacitor

/// The bookmark ribbons, built by the web app (native-bookmarks.service.ts),
/// which keeps the rules: each colour marks one chapter at most.
struct BookmarksSheetState {
    struct Ribbon {
        /// The CSS colour name the bookmark stores.
        let color: String
        /// Spoken name, e.g. "Vermelho".
        let name: String
        /// The passage the ribbon marks, e.g. "Mt 5"; nil when it is free.
        let label: String?
        /// Marks the chapter being read.
        let current: Bool
    }

    /// A ribbon to move to the chapter being read, as one moves a ribbon on
    /// reading further; once moved, the sheet offers to move it back.
    struct Move {
        let color: String
        /// The ribbon's adjective, e.g. "vermelho".
        let name: String
        /// Where it is, or was before the move, e.g. "Mateus 5".
        let from: String
        /// Moved already: the row undoes it.
        let done: Bool
    }

    /// What a free ribbon would mark, e.g. "Mateus 11".
    let currentLabel: String
    let ribbons: [Ribbon]
    let move: Move?

    init(_ call: CAPPluginCall) {
        currentLabel = call.getString("currentLabel", "")
        ribbons = (call.getArray("ribbons", JSObject.self) ?? []).map { ribbon in
            Ribbon(color: ribbon["color"] as? String ?? "",
                   name: ribbon["name"] as? String ?? "",
                   label: ribbon["label"] as? String,
                   current: ribbon["current"] as? Bool ?? false)
        }
        move = call.getObject("move").map { move in
            Move(color: move["color"] as? String ?? "",
                 name: move["name"] as? String ?? "",
                 from: move["from"] as? String ?? "",
                 done: move["done"] as? Bool ?? false)
        }
    }
}

/// The web app's ribbon colours (bookmark-ribbons.service.ts), as system colours.
func ribbonColor(_ name: String) -> UIColor? {
    switch name {
    case "red": return .systemRed
    case "orange": return .systemOrange
    case "teal": return .systemTeal
    case "green": return .systemGreen
    case "blue": return .systemBlue
    case "indigo": return .systemIndigo
    case "violet": return .systemPurple
    case "grey": return .systemGray
    default: return nil
    }
}

/// Eight ribbons in a grid, like the web panel. A free ribbon marks the chapter
/// being read; a used one opens its passage. Above them, a row moves the ribbon
/// the reader read on from to this chapter. Editar shows remove badges, and a
/// long press offers Abrir, Mover and Remover.
final class BookmarksController: UIViewController {
    private var state: BookmarksSheetState
    private let send: (_ action: String, _ color: String) -> Void
    private let onClose: () -> Void
    private let column = UIStackView()
    private let moveRow = UIButton(type: .system)
    private let grid = UIStackView()
    private let footer = UILabel()
    private var editingRibbons = false

    init(state: BookmarksSheetState, send: @escaping (String, String) -> Void, onClose: @escaping () -> Void) {
        self.state = state
        self.send = send
        self.onClose = onClose
        super.init(nibName: nil, bundle: nil)
        title = "Marcadores"
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

    /// As a popover, on iPad, it has no ✕: a tap outside closes it.
    var showsClose = true {
        didSet { navigationItem.rightBarButtonItem = showsClose ? closeButton(for: self) : nil }
    }

    /// As a popover: this wide, and as tall as what it shows.
    private static let popoverWidth: CGFloat = 375

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = sheetBackground
        navigationItem.rightBarButtonItem = showsClose ? closeButton(for: self) : nil

        moveRow.addAction(UIAction { [weak self] _ in self?.moveTapped() }, for: .primaryActionTriggered)
        grid.axis = .vertical
        grid.spacing = 10
        grid.distribution = .fillEqually
        column.axis = .vertical
        column.spacing = 12
        column.addArrangedSubview(moveRow)
        column.addArrangedSubview(grid)
        footer.font = limitedFont(.footnote)
        footer.adjustsFontForContentSizeCategory = true
        footer.textColor = .secondaryLabel
        footer.numberOfLines = 0
        footer.textAlignment = .center

        for subview in [column, footer] as [UIView] {
            subview.translatesAutoresizingMaskIntoConstraints = false
            view.addSubview(subview)
        }
        let safeArea = view.safeAreaLayoutGuide
        NSLayoutConstraint.activate([
            column.topAnchor.constraint(equalTo: safeArea.topAnchor, constant: 8),
            column.leadingAnchor.constraint(equalTo: safeArea.leadingAnchor, constant: 16),
            column.trailingAnchor.constraint(equalTo: safeArea.trailingAnchor, constant: -16),
            grid.heightAnchor.constraint(equalToConstant: 2 * 84 + 10),
            footer.topAnchor.constraint(equalTo: column.bottomAnchor, constant: 16),
            footer.leadingAnchor.constraint(equalTo: safeArea.leadingAnchor, constant: 24),
            footer.trailingAnchor.constraint(equalTo: safeArea.trailingAnchor, constant: -24),
        ])
        render()
        updatePopoverSize()
    }

    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        if isBeingDismissed || navigationController?.isBeingDismissed == true {
            onClose()
        }
    }

    func update(_ next: BookmarksSheetState) {
        state = next
        if !state.ribbons.contains(where: { $0.label != nil }) {
            editingRibbons = false
        }
        render()
        // The new tiles take their places now: laid out inside the resize
        // below, they grew in from a corner with every mark and removal.
        view.layoutIfNeeded()
        updatePopoverSize()
        // Resized only when the move row comes or goes, or the hint takes
        // another line.
        let sheet = navigationController?.sheetPresentationController
            ?? navigationController?.popoverPresentationController?.adaptiveSheetPresentationController
        if #available(iOS 16.0, *), let sheet, let shown = sheetSize,
           sheetHeight(width: shown.width) != shown.height {
            sheet.animateChanges { sheet.invalidateDetents() }
        }
    }

    /// As a popover, the size of what it shows: the ribbons, the hint, and
    /// the move row when there is one.
    private func updatePopoverSize() {
        let width = Self.popoverWidth
        var height = 8 + 2 * 84 + 10 + 16 + fittingHeight(footer, width: width - 48) + 20
        if state.move != nil {
            height += fittingHeight(moveRow, width: width - 32) + column.spacing
        }
        preferredContentSize = CGSize(width: width, height: height)
    }

    /// The width the sheet was last measured at, and the height it was given.
    private var sheetSize: (width: CGFloat, height: CGFloat)?

    /// The sheet's height: the ribbons and the hint, plus the move row when
    /// there is one. `width` is the sheet's.
    func sheetHeight(width: CGFloat) -> CGFloat {
        let height = measuredSheetHeight(width: width)
        sheetSize = (width, height)
        return height
    }

    private func measuredSheetHeight(width: CGFloat) -> CGFloat {
        guard width > 48 else { return 300 }
        loadViewIfNeeded()
        // 300 holds the ribbons and two lines of hint at the standard text
        // size; at larger sizes the hint takes more.
        let standard = UITraitCollection(preferredContentSizeCategory: .large)
        let standardHint = 2 * UIFont.preferredFont(forTextStyle: .footnote, compatibleWith: standard).lineHeight
        var height = 300 + max(0, fittingHeight(footer, width: width - 48) - standardHint)
        if state.move != nil {
            height += fittingHeight(moveRow, width: width - 32) + column.spacing
        }
        return height
    }

    private func fittingHeight(_ view: UIView, width: CGFloat) -> CGFloat {
        view.systemLayoutSizeFitting(CGSize(width: width, height: 0),
                                     withHorizontalFittingPriority: .required,
                                     verticalFittingPriority: .fittingSizeLevel).height
    }

    private func moveTapped() {
        guard let move = state.move else { return }
        send(move.done ? "bookmark-undo" : "bookmark-move", move.color)
        UIAccessibility.post(notification: .announcement, argument: move.done
            ? "Marcador \(move.name) de volta a \(move.from)"
            : "Marcador \(move.name) em \(state.currentLabel)")
    }

    // MARK: - Drawing

    private func render() {
        let anyUsed = state.ribbons.contains { $0.label != nil }
        if anyUsed {
            let edit = UIBarButtonItem(title: editingRibbons ? "OK" : "Editar", primaryAction: UIAction { [weak self] _ in
                guard let self else { return }
                self.editingRibbons.toggle()
                self.render()
            })
            if editingRibbons, #available(iOS 26.0, *) {
                edit.style = .prominent
                edit.tintColor = ChromeViewController.selectionFill
            }
            navigationItem.leftBarButtonItem = edit
        } else {
            navigationItem.leftBarButtonItem = nil
        }

        let marked = state.ribbons.contains { $0.current }
        footer.text = editingRibbons ? "Toque numa fita para a retirar."
            : marked ? "\(state.currentLabel) está marcado. Toque noutra fita livre para mudar a cor."
            : "Toque numa fita livre para marcar \(state.currentLabel)."

        renderMove()
        grid.arrangedSubviews.forEach { $0.removeFromSuperview() }
        for row in stride(from: 0, to: state.ribbons.count, by: 4) {
            let line = UIStackView(arrangedSubviews: state.ribbons[row..<min(row + 4, state.ribbons.count)].map(tile))
            line.spacing = 10
            line.distribution = .fillEqually
            grid.addArrangedSubview(line)
        }
    }

    /// "Mover para Mateus 7", under it "O marcador vermelho está em Mateus 5";
    /// once moved, "Desfazer".
    private func renderMove() {
        guard let move = state.move, !editingRibbons else {
            moveRow.isHidden = true
            return
        }
        moveRow.isHidden = false
        var config = UIButton.Configuration.plain()
        config.image = UIImage(systemName: move.done ? "arrow.uturn.backward" : "bookmark.fill",
                               withConfiguration: UIImage.SymbolConfiguration(pointSize: 22, weight: .medium))?
            .withTintColor(move.done ? .label : ribbonColor(move.color) ?? .label, renderingMode: .alwaysOriginal)
        config.imagePadding = 14
        config.title = move.done ? "Desfazer" : "Mover para \(state.currentLabel)"
        config.subtitle = move.done ? "O marcador \(move.name) volta a \(move.from)."
            : "O marcador \(move.name) está em \(move.from)."
        config.titleAlignment = .leading
        config.titlePadding = 2
        config.titleTextAttributesTransformer = UIConfigurationTextAttributesTransformer { attributes in
            var attributes = attributes
            attributes.font = limitedFont(.systemFont(ofSize: 17, weight: .semibold), .body)
            return attributes
        }
        config.subtitleTextAttributesTransformer = UIConfigurationTextAttributesTransformer { attributes in
            var attributes = attributes
            attributes.font = limitedFont(.footnote)
            attributes.foregroundColor = UIColor.secondaryLabel
            return attributes
        }
        config.baseForegroundColor = .label
        config.contentInsets = NSDirectionalEdgeInsets(top: 12, leading: 16, bottom: 12, trailing: 16)
        config.background.backgroundColor = tileBackground
        config.background.cornerRadius = 14
        moveRow.configuration = config
        moveRow.contentHorizontalAlignment = .leading
        moveRow.accessibilityLabel = move.done ? "Desfazer"
            : "Mover o marcador \(move.name) para \(state.currentLabel)"
        moveRow.accessibilityValue = move.done ? nil : "Está em \(move.from)"
        moveRow.accessibilityHint = move.done ? "O marcador \(move.name) volta a \(move.from)" : nil
    }

    private func tile(_ ribbon: BookmarksSheetState.Ribbon) -> UIView {
        let used = ribbon.label != nil
        var config = UIButton.Configuration.plain()
        let color = ribbonColor(ribbon.color) ?? .label
        config.image = UIImage(systemName: used ? "bookmark.fill" : "bookmark",
                               withConfiguration: UIImage.SymbolConfiguration(pointSize: 26, weight: .medium))?
            .withTintColor(color, renderingMode: .alwaysOriginal)
        config.imagePlacement = .top
        config.imagePadding = 6
        // A free ribbon shows only its colour, as Apple's swatches do; the
        // hint below says what tapping one does.
        config.title = ribbon.label
        config.titleLineBreakMode = .byTruncatingTail
        // A quarter of the row: "Sl 119" must fit at large text sizes too.
        config.contentInsets = NSDirectionalEdgeInsets(top: 8, leading: 4, bottom: 8, trailing: 4)
        config.titleTextAttributesTransformer = UIConfigurationTextAttributesTransformer { attributes in
            var attributes = attributes
            attributes.font = limitedFont(.subheadline, limit: 1.5)
            return attributes
        }
        config.baseForegroundColor = ribbon.current ? ChromeViewController.onSelection
            : (used ? .label : .secondaryLabel)
        config.background.backgroundColor = ribbon.current ? ChromeViewController.selectionFill : tileBackground
        config.background.cornerRadius = 14
        let button = UIButton(configuration: config)
        button.titleLabel?.adjustsFontSizeToFitWidth = true
        button.titleLabel?.minimumScaleFactor = 0.7

        var spoken = ribbon.name
        if let label = ribbon.label { spoken += ", \(label)" } else { spoken += ", livre" }
        if ribbon.current { spoken += ", este capítulo" }
        button.accessibilityLabel = spoken

        if editingRibbons {
            // Only used ribbons can be removed; free ones step back.
            button.isEnabled = used
            button.alpha = used ? 1 : 0.35
            button.accessibilityHint = used ? "Retira o marcador" : nil
            button.addAction(UIAction { [weak self] _ in self?.send("bookmark-remove", ribbon.color) },
                             for: .primaryActionTriggered)
            if used {
                let badge = UIImageView(image: UIImage(systemName: "minus.circle.fill"))
                badge.tintColor = .systemRed
                badge.backgroundColor = sheetBackground
                badge.layer.cornerRadius = 11
                badge.translatesAutoresizingMaskIntoConstraints = false
                button.addSubview(badge)
                NSLayoutConstraint.activate([
                    badge.widthAnchor.constraint(equalToConstant: 22),
                    badge.heightAnchor.constraint(equalToConstant: 22),
                    badge.topAnchor.constraint(equalTo: button.topAnchor, constant: -6),
                    badge.leadingAnchor.constraint(equalTo: button.leadingAnchor, constant: -6),
                ])
            }
        } else if used {
            button.accessibilityHint = "Abre a passagem"
            button.addAction(UIAction { [weak self] _ in
                self?.send("bookmark-open", ribbon.color)
                self?.dismiss(animated: true)
            }, for: .primaryActionTriggered)
            // A long press offers the same, moving it here, and removing it.
            // Not onto a chapter that has a ribbon: that one would come off.
            let open = UIAction(title: "Abrir", image: UIImage(systemName: "book")) { [weak self] _ in
                self?.send("bookmark-open", ribbon.color)
                self?.dismiss(animated: true)
            }
            let move = UIAction(title: "Mover para \(state.currentLabel)",
                                image: UIImage(systemName: "bookmark")) { [weak self] _ in
                self?.send("bookmark-move", ribbon.color)
            }
            let remove = UIAction(title: "Remover marcador", image: UIImage(systemName: "bookmark.slash"),
                                  attributes: .destructive) { [weak self] _ in
                self?.send("bookmark-remove", ribbon.color)
            }
            let marked = state.ribbons.contains { $0.current }
            button.menu = UIMenu(title: ribbon.label ?? "", children: marked ? [open, remove] : [open, move, remove])
        } else {
            button.accessibilityHint = "Marca \(state.currentLabel)"
            button.addAction(UIAction { [weak self] _ in self?.send("bookmark-set", ribbon.color) },
                             for: .primaryActionTriggered)
        }
        return button
    }
}
