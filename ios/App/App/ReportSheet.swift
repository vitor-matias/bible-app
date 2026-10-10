import UIKit
import Capacitor

/// The report form's content, from the web app (native-report.service.ts).
struct ReportSheetState {
    struct Topic {
        let value: String
        let label: String
    }

    /// What is being reported on, e.g. "Encontrou algum problema em …?".
    let message: String
    let topics: [Topic]
    let placeholder: String
    let maxLength: Int

    init(_ call: CAPPluginCall) {
        message = call.getString("message", "")
        topics = (call.getArray("topics", JSObject.self) ?? []).map { topic in
            Topic(value: topic["value"] as? String ?? "", label: topic["label"] as? String ?? "")
        }
        placeholder = call.getString("placeholder", "")
        maxLength = call.getInt("maxLength", 500)
    }
}

/// "Reportar erro" as an iOS form: an inset grouped list with the kind of
/// problem and the details, Cancel and Send in the bar. The web app sends the
/// report and answers through `finish`: the sheet closes, or says what failed
/// and stays, keeping what was typed. Closing with something typed asks first.
final class ReportController: UITableViewController, UITextViewDelegate,
    UIAdaptivePresentationControllerDelegate {
    private enum Section: Int, CaseIterable {
        case topic, details
    }

    private let state: ReportSheetState
    private let onSubmit: (_ topic: String, _ details: String) -> Void
    private let onClose: () -> Void
    private var topic: Int?
    private let detailsView = UITextView()
    private let placeholderLabel = UILabel()
    private lazy var sendItem = UIBarButtonItem(title: "Enviar", primaryAction: UIAction { [weak self] _ in
        self?.submit()
    })
    private var sending = false
    /// Under the details: characters used of those allowed.
    private let counter = UITableViewHeaderFooterView()

    init(state: ReportSheetState,
         onSubmit: @escaping (_ topic: String, _ details: String) -> Void,
         onClose: @escaping () -> Void) {
        self.state = state
        self.onSubmit = onSubmit
        self.onClose = onClose
        super.init(style: .insetGrouped)
        title = "Reportar erro"
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

    private var details: String {
        detailsView.text.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// Anything the reader would lose by closing.
    private var hasChanges: Bool { topic != nil || !details.isEmpty }

    override func viewDidLoad() {
        super.viewDidLoad()
        tableView.backgroundColor = sheetBackground
        tableView.keyboardDismissMode = .interactive
        tableView.register(UITableViewCell.self, forCellReuseIdentifier: "topic")

        navigationItem.leftBarButtonItem = UIBarButtonItem(systemItem: .cancel, primaryAction: UIAction { [weak self] _ in
            self?.cancel()
        })
        if #available(iOS 26.0, *) {
            sendItem.style = .prominent
        } else {
            sendItem.style = .done
        }
        navigationItem.rightBarButtonItem = sendItem

        detailsView.font = .preferredFont(forTextStyle: .body)
        detailsView.adjustsFontForContentSizeCategory = true
        detailsView.textColor = .label
        detailsView.backgroundColor = .clear
        detailsView.textContainerInset = UIEdgeInsets(top: 11, left: 0, bottom: 11, right: 0)
        detailsView.textContainer.lineFragmentPadding = 0
        detailsView.delegate = self
        detailsView.accessibilityLabel = "Detalhes"

        placeholderLabel.text = state.placeholder
        placeholderLabel.font = .preferredFont(forTextStyle: .body)
        placeholderLabel.adjustsFontForContentSizeCategory = true
        placeholderLabel.textColor = .placeholderText
        placeholderLabel.numberOfLines = 0
        placeholderLabel.isAccessibilityElement = false

        // The question about the chapter, above the groups.
        let intro = UILabel()
        intro.text = state.message
        intro.font = .preferredFont(forTextStyle: .subheadline)
        intro.adjustsFontForContentSizeCategory = true
        intro.textColor = .secondaryLabel
        intro.numberOfLines = 0
        intro.translatesAutoresizingMaskIntoConstraints = false
        let header = UIView()
        header.preservesSuperviewLayoutMargins = true
        header.addSubview(intro)
        NSLayoutConstraint.activate([
            intro.leadingAnchor.constraint(equalTo: header.layoutMarginsGuide.leadingAnchor),
            intro.trailingAnchor.constraint(equalTo: header.layoutMarginsGuide.trailingAnchor),
            intro.topAnchor.constraint(equalTo: header.topAnchor, constant: 8),
            intro.bottomAnchor.constraint(equalTo: header.bottomAnchor, constant: -4),
        ])
        tableView.tableHeaderView = header
        updateSend()
    }

    /// A table header doesn't size itself: fit it to its text.
    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        guard let header = tableView.tableHeaderView else { return }
        let width = tableView.bounds.width
        let height = header.systemLayoutSizeFitting(CGSize(width: width, height: 0),
                                                    withHorizontalFittingPriority: .required,
                                                    verticalFittingPriority: .fittingSizeLevel).height
        guard header.frame.size != CGSize(width: width, height: height) else { return }
        header.frame = CGRect(x: 0, y: 0, width: width, height: height)
        tableView.tableHeaderView = header
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        navigationController?.presentationController?.delegate = self
    }

    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        if isBeingDismissed || navigationController?.isBeingDismissed == true {
            onClose()
        }
    }

    // MARK: - Sending

    private func updateSend() {
        sendItem.isEnabled = !sending && topic != nil && !details.isEmpty
        // Swiping the sheet down mustn't lose what was typed.
        navigationController?.isModalInPresentation = hasChanges || sending
    }

    private func submit() {
        guard let topic, !details.isEmpty, !sending else { return }
        sending = true
        detailsView.resignFirstResponder()
        let spinner = UIActivityIndicatorView(style: .medium)
        spinner.startAnimating()
        navigationItem.rightBarButtonItem = UIBarButtonItem(customView: spinner)
        navigationItem.leftBarButtonItem?.isEnabled = false
        updateSend()
        onSubmit(state.topics[topic].value, details)
    }

    /// The web app's answer: sent, or why not.
    func finish(sent: Bool, message: String) {
        sending = false
        navigationItem.rightBarButtonItem = sendItem
        navigationItem.leftBarButtonItem?.isEnabled = true
        updateSend()
        if sent {
            dismiss(animated: true)
            return
        }
        let alert = UIAlertController(title: "Não foi possível enviar", message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default))
        present(alert, animated: true)
    }

    // MARK: - Closing

    private func cancel() {
        if hasChanges {
            confirmDiscard(from: navigationItem.leftBarButtonItem)
        } else {
            dismiss(animated: true)
        }
    }

    private func confirmDiscard(from item: UIBarButtonItem?) {
        let sheet = UIAlertController(title: nil, message: nil, preferredStyle: .actionSheet)
        sheet.addAction(UIAlertAction(title: "Descartar relatório", style: .destructive) { [weak self] _ in
            self?.dismiss(animated: true)
        })
        sheet.addAction(UIAlertAction(title: "Continuar a editar", style: .cancel))
        sheet.popoverPresentationController?.barButtonItem = item
        present(sheet, animated: true)
    }

    func presentationControllerDidAttemptToDismiss(_ presentationController: UIPresentationController) {
        guard !sending else { return }
        confirmDiscard(from: navigationItem.leftBarButtonItem)
    }

    // MARK: - Table

    override func numberOfSections(in tableView: UITableView) -> Int { Section.allCases.count }

    override func tableView(_ tableView: UITableView, numberOfRowsInSection section: Int) -> Int {
        Section(rawValue: section) == .topic ? state.topics.count : 1
    }

    override func tableView(_ tableView: UITableView, titleForHeaderInSection section: Int) -> String? {
        Section(rawValue: section) == .topic ? "Tipo de problema" : "Detalhes"
    }

    override func tableView(_ tableView: UITableView, viewForFooterInSection section: Int) -> UIView? {
        guard Section(rawValue: section) == .details else { return nil }
        updateCounter()
        return counter
    }

    override func tableView(_ tableView: UITableView, cellForRowAt indexPath: IndexPath) -> UITableViewCell {
        switch Section(rawValue: indexPath.section) {
        case .topic:
            let cell = tableView.dequeueReusableCell(withIdentifier: "topic", for: indexPath)
            var content = cell.defaultContentConfiguration()
            content.text = state.topics[indexPath.row].label
            cell.contentConfiguration = content
            cell.accessoryType = indexPath.row == topic ? .checkmark : .none
            cell.backgroundColor = tileBackground
            return cell
        default:
            let cell = UITableViewCell(style: .default, reuseIdentifier: nil)
            cell.selectionStyle = .none
            cell.backgroundColor = tileBackground
            for view in [detailsView, placeholderLabel] as [UIView] {
                view.translatesAutoresizingMaskIntoConstraints = false
                cell.contentView.addSubview(view)
            }
            let margins = cell.contentView.layoutMarginsGuide
            NSLayoutConstraint.activate([
                detailsView.leadingAnchor.constraint(equalTo: margins.leadingAnchor),
                detailsView.trailingAnchor.constraint(equalTo: margins.trailingAnchor),
                detailsView.topAnchor.constraint(equalTo: cell.contentView.topAnchor),
                detailsView.bottomAnchor.constraint(equalTo: cell.contentView.bottomAnchor),
                detailsView.heightAnchor.constraint(greaterThanOrEqualToConstant: 140),
                placeholderLabel.leadingAnchor.constraint(equalTo: detailsView.leadingAnchor),
                placeholderLabel.trailingAnchor.constraint(equalTo: detailsView.trailingAnchor),
                placeholderLabel.topAnchor.constraint(equalTo: detailsView.topAnchor, constant: 11),
            ])
            placeholderLabel.isHidden = !detailsView.text.isEmpty
            return cell
        }
    }

    override func tableView(_ tableView: UITableView, didSelectRowAt indexPath: IndexPath) {
        tableView.deselectRow(at: indexPath, animated: true)
        guard Section(rawValue: indexPath.section) == .topic, !sending else { return }
        let previous = topic
        topic = indexPath.row
        let rows = [previous, topic].compactMap { $0 }.map { IndexPath(row: $0, section: Section.topic.rawValue) }
        for row in rows {
            tableView.cellForRow(at: row)?.accessoryType = row.row == topic ? .checkmark : .none
        }
        updateSend()
    }

    // MARK: - Details

    func textView(_ textView: UITextView, shouldChangeTextIn range: NSRange, replacementText text: String) -> Bool {
        guard !sending else { return false }
        let current = textView.text as NSString
        return current.replacingCharacters(in: range, with: text).count <= state.maxLength
    }

    func textViewDidChange(_ textView: UITextView) {
        placeholderLabel.isHidden = !textView.text.isEmpty
        updateSend()
        updateCounter()
    }

    /// Updated in place: reloading the section would end the typing.
    private func updateCounter() {
        var content = UIListContentConfiguration.groupedFooter()
        content.text = "\(detailsView.text.count) / \(state.maxLength)"
        counter.contentConfiguration = content
    }
}
