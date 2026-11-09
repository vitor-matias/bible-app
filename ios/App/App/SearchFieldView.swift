import UIKit

/// The field for searching a screen: glass, at the bottom, above the keyboard.
final class SearchFieldView: UIView, UITextFieldDelegate {
    var onSubmit: ((String) -> Void)?
    /// Every edit: the web app searches once typing pauses.
    var onChange: ((String) -> Void)?
    /// With one, ✕ shows beside the field, which closes it (a list's filter).
    var onClose: (() -> Void)? {
        didSet {
            closeButton.isHidden = onClose == nil
            // Off first: both on at once pin the field's end twice, a conflict.
            NSLayoutConstraint.deactivate([onClose == nil ? fieldToClose : fieldToEnd])
            NSLayoutConstraint.activate([onClose == nil ? fieldToEnd : fieldToClose])
        }
    }
    private let field = UISearchTextField()
    private let background: UIVisualEffectView
    private lazy var closeButton: UIButton = {
        var config: UIButton.Configuration
        if #available(iOS 26.0, *) {
            config = .glass()
        } else {
            config = .plain()
            config.background.visualEffect = UIBlurEffect(style: .systemThinMaterial)
        }
        config.cornerStyle = .capsule
        config.baseForegroundColor = .label
        config.image = UIImage(systemName: "xmark")
        let button = UIButton(configuration: config, primaryAction: UIAction { [weak self] _ in self?.onClose?() })
        button.accessibilityLabel = "Fechar"
        button.isHidden = true
        button.translatesAutoresizingMaskIntoConstraints = false
        return button
    }()
    private lazy var fieldToEnd = background.trailingAnchor.constraint(equalTo: trailingAnchor)
    private lazy var fieldToClose = background.trailingAnchor.constraint(equalTo: closeButton.leadingAnchor, constant: -8)

    var text: String {
        get { field.text ?? "" }
        set { field.text = newValue }
    }

    var placeholder: String? {
        get { field.placeholder }
        set { field.placeholder = newValue }
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

        field.returnKeyType = .search
        field.backgroundColor = .clear
        field.borderStyle = .none
        field.autocorrectionType = .no
        field.delegate = self
        field.addAction(UIAction { [weak self] _ in self?.onChange?(self?.text ?? "") }, for: .editingChanged)
        field.translatesAutoresizingMaskIntoConstraints = false
        background.contentView.addSubview(field)
        addSubview(closeButton)

        NSLayoutConstraint.activate([
            background.leadingAnchor.constraint(equalTo: leadingAnchor),
            fieldToEnd,
            closeButton.trailingAnchor.constraint(equalTo: trailingAnchor),
            closeButton.centerYAnchor.constraint(equalTo: centerYAnchor),
            closeButton.widthAnchor.constraint(equalToConstant: 48),
            closeButton.heightAnchor.constraint(equalToConstant: 48),
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
