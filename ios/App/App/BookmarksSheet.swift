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

    /// What a free ribbon would mark, e.g. "Mateus 11".
    let currentLabel: String
    let ribbons: [Ribbon]

    init(_ call: CAPPluginCall) {
        currentLabel = call.getString("currentLabel", "")
        ribbons = (call.getArray("ribbons", JSObject.self) ?? []).map { ribbon in
            Ribbon(color: ribbon["color"] as? String ?? "",
                   name: ribbon["name"] as? String ?? "",
                   label: ribbon["label"] as? String,
                   current: ribbon["current"] as? Bool ?? false)
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
/// being read; a used one opens its passage. Editar shows remove badges, and a
/// long press offers Abrir and Remover.
final class BookmarksController: UIViewController {
    private var state: BookmarksSheetState
    private let send: (_ action: String, _ color: String) -> Void
    private let onClose: () -> Void
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

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = sheetBackground
        navigationItem.rightBarButtonItem = closeButton(for: self)

        grid.axis = .vertical
        grid.spacing = 10
        grid.distribution = .fillEqually
        footer.font = .preferredFont(forTextStyle: .footnote)
        footer.adjustsFontForContentSizeCategory = true
        footer.textColor = .secondaryLabel
        footer.numberOfLines = 0
        footer.textAlignment = .center

        for subview in [grid, footer] as [UIView] {
            subview.translatesAutoresizingMaskIntoConstraints = false
            view.addSubview(subview)
        }
        let safeArea = view.safeAreaLayoutGuide
        NSLayoutConstraint.activate([
            grid.topAnchor.constraint(equalTo: safeArea.topAnchor, constant: 8),
            grid.leadingAnchor.constraint(equalTo: safeArea.leadingAnchor, constant: 16),
            grid.trailingAnchor.constraint(equalTo: safeArea.trailingAnchor, constant: -16),
            grid.heightAnchor.constraint(equalToConstant: 2 * 84 + 10),
            footer.topAnchor.constraint(equalTo: grid.bottomAnchor, constant: 16),
            footer.leadingAnchor.constraint(equalTo: safeArea.leadingAnchor, constant: 24),
            footer.trailingAnchor.constraint(equalTo: safeArea.trailingAnchor, constant: -24),
        ])
        render()
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

        grid.arrangedSubviews.forEach { $0.removeFromSuperview() }
        for row in stride(from: 0, to: state.ribbons.count, by: 4) {
            let line = UIStackView(arrangedSubviews: state.ribbons[row..<min(row + 4, state.ribbons.count)].map(tile))
            line.spacing = 10
            line.distribution = .fillEqually
            grid.addArrangedSubview(line)
        }
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
        config.title = ribbon.label ?? "Marcar"
        config.titleLineBreakMode = .byTruncatingTail
        config.titleTextAttributesTransformer = UIConfigurationTextAttributesTransformer { attributes in
            var attributes = attributes
            attributes.font = UIFont.preferredFont(forTextStyle: used ? .subheadline : .footnote)
            return attributes
        }
        config.baseForegroundColor = ribbon.current ? ChromeViewController.onSelection
            : (used ? .label : .secondaryLabel)
        config.background.backgroundColor = ribbon.current ? ChromeViewController.selectionFill : tileBackground
        config.background.cornerRadius = 14
        let button = UIButton(configuration: config)

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
            // A long press offers the same, plus removing it.
            button.menu = UIMenu(title: ribbon.label ?? "", children: [
                UIAction(title: "Abrir", image: UIImage(systemName: "book")) { [weak self] _ in
                    self?.send("bookmark-open", ribbon.color)
                    self?.dismiss(animated: true)
                },
                UIAction(title: "Remover marcador", image: UIImage(systemName: "bookmark.slash"),
                         attributes: .destructive) { [weak self] _ in
                    self?.send("bookmark-remove", ribbon.color)
                },
            ])
        } else {
            button.accessibilityHint = "Marca \(state.currentLabel)"
            button.addAction(UIAction { [weak self] _ in self?.send("bookmark-set", ribbon.color) },
                             for: .primaryActionTriggered)
        }
        return button
    }
}
