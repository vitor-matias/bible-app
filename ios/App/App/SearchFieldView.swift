import UIKit

/// The search page's field: glass, at the bottom, above the keyboard.
final class SearchFieldView: UIView, UITextFieldDelegate {
    var onSubmit: ((String) -> Void)?
    /// Every edit: the web app searches once typing pauses.
    var onChange: ((String) -> Void)?
    private let field = UISearchTextField()
    private let background: UIVisualEffectView

    var text: String {
        get { field.text ?? "" }
        set { field.text = newValue }
    }

    var isEditing: Bool { field.isEditing }

    init() {
        if #available(iOS 26.0, *) {
            background = UIVisualEffectView(effect: UIGlassEffect())
        } else {
            background = UIVisualEffectView(effect: UIBlurEffect(style: .systemThinMaterial))
        }
        super.init(frame: .zero)

        background.clipsToBounds = true
        background.translatesAutoresizingMaskIntoConstraints = false
        addSubview(background)

        field.placeholder = "Procurar na Bíblia"
        field.returnKeyType = .search
        field.backgroundColor = .clear
        field.borderStyle = .none
        field.autocorrectionType = .no
        field.delegate = self
        field.addAction(UIAction { [weak self] _ in self?.onChange?(self?.text ?? "") }, for: .editingChanged)
        field.translatesAutoresizingMaskIntoConstraints = false
        background.contentView.addSubview(field)

        NSLayoutConstraint.activate([
            background.leadingAnchor.constraint(equalTo: leadingAnchor),
            background.trailingAnchor.constraint(equalTo: trailingAnchor),
            background.topAnchor.constraint(equalTo: topAnchor),
            background.bottomAnchor.constraint(equalTo: bottomAnchor),
            heightAnchor.constraint(equalToConstant: 48),
            field.leadingAnchor.constraint(equalTo: background.contentView.leadingAnchor, constant: 14),
            field.trailingAnchor.constraint(equalTo: background.contentView.trailingAnchor, constant: -14),
            field.centerYAnchor.constraint(equalTo: background.contentView.centerYAnchor),
        ])
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

    override func layoutSubviews() {
        super.layoutSubviews()
        background.layer.cornerRadius = bounds.height / 2
    }

    func focus() {
        field.becomeFirstResponder()
    }

    func textFieldShouldReturn(_ textField: UITextField) -> Bool {
        onSubmit?(textField.text ?? "")
        textField.resignFirstResponder()
        return false
    }
}
