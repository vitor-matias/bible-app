import UIKit
import Capacitor

/// The books and chapters the picker offers. Built by the web app
/// (utils/passage-picker.ts) from the same canon groups as its book selector.
struct PassagePickerData {
    struct Chapter: Hashable {
        let number: Int
        /// Empty for the introduction.
        let label: String
        /// A psalm's liturgical number, shown small under its own ("22" for 23).
        let detail: String?
        /// What VoiceOver says instead of "Capítulo 23": "Salmo 23, na liturgia 22".
        let spoken: String?
        let title: String?
        /// The bookmark ribbon's colour name, if the chapter is bookmarked.
        let bookmark: String?
    }

    struct Book: Hashable {
        let id: String
        let label: String
        let name: String
        /// "Gn", "Ex"…: the label in the compact mode.
        let abbreviation: String
        /// Empty for a standalone introduction, which opens directly.
        let chapters: [Chapter]
    }

    struct Group: Hashable {
        /// nil for books listed outside any group.
        let title: String?
        let books: [Book]
    }

    struct Section: Hashable {
        let title: String
        let groups: [Group]
    }

    let sections: [Section]
    let currentBookId: String
    let currentChapter: Int

    init(_ call: CAPPluginCall) {
        currentBookId = call.getString("currentBookId", "")
        currentChapter = call.getInt("currentChapter", 0)
        sections = (call.getArray("sections", JSObject.self) ?? []).map { section in
            Section(title: section["title"] as? String ?? "",
                    groups: Self.objects(section["groups"]).map { group in
                        Group(title: group["title"] as? String,
                              books: Self.objects(group["books"]).map(Self.book))
                    })
        }
    }

    var currentBook: Book? {
        sections.lazy.flatMap(\.groups).flatMap(\.books).first { $0.id == currentBookId }
    }

    private static func book(_ object: JSObject) -> Book {
        Book(id: object["id"] as? String ?? "",
             label: object["label"] as? String ?? "",
             name: object["name"] as? String ?? "",
             abbreviation: object["abbreviation"] as? String ?? "",
             chapters: objects(object["chapters"]).map { chapter in
                 Chapter(number: (chapter["number"] as? NSNumber)?.intValue ?? 0,
                         label: chapter["label"] as? String ?? "",
                         detail: chapter["detail"] as? String,
                         spoken: chapter["spoken"] as? String,
                         title: chapter["title"] as? String,
                         bookmark: chapter["bookmark"] as? String)
             })
    }

    private static func objects(_ value: JSValue?) -> [JSObject] {
        (value as? JSArray)?.compactMap { $0 as? JSObject } ?? []
    }
}

/// A sheet with the books, then the chosen book's chapters. It opens on the
/// current book's chapters, with Back leading to the books.
final class PassagePickerController: UINavigationController {
    init(data: PassagePickerData, onSelect: @escaping (String, Int?) -> Void) {
        let books = BookListViewController(data: data)
        super.init(rootViewController: books)
        books.onSelect = { [weak self] bookId, chapter in
            onSelect(bookId, chapter)
            self?.dismiss(animated: true)
        }
        if let current = data.currentBook, !current.chapters.isEmpty {
            pushViewController(books.chapterList(for: current), animated: false)
        }

        // Half height or full, as the footnotes: the text stays in view, and
        // the long lists (73 books, up to 150 chapters) pull up to full by
        // the grabber; scrolling scrolls them at either height.
        modalPresentationStyle = .pageSheet
        if let sheet = sheetPresentationController {
            sheet.detents = [.medium(), .large()]
            sheet.prefersGrabberVisible = true
            sheet.prefersScrollingExpandsWhenScrolledToEdge = false
        }
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }
}

/// The books as tiles, a section per canon group. Shown by name, or by
/// abbreviation in a denser grid that fits most of a testament on one screen;
/// the choice is remembered.
private final class BookListViewController: UICollectionViewController, UISearchResultsUpdating {
    typealias Book = PassagePickerData.Book

    enum Mode: String {
        case names, abbreviations
    }

    var onSelect: ((String, Int?) -> Void)?
    private let data: PassagePickerData
    private var dataSource: UICollectionViewDiffableDataSource<String, Book>!
    private static let modeKey = "passagePicker.bookMode"
    private var mode = Mode(rawValue: UserDefaults.standard.string(forKey: modeKey) ?? "") ?? .names

    init(data: PassagePickerData) {
        self.data = data
        super.init(collectionViewLayout: Self.layout(for: mode))
        title = "Livros"
        navigationItem.backButtonTitle = "Livros"
    }

    private static func layout(for mode: Mode) -> UICollectionViewLayout {
        switch mode {
        case .names: return tileLayout(minWidth: 104, height: 56)
        case .abbreviations: return tileLayout(minWidth: 52, height: 48)
        }
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

    override func viewDidLoad() {
        super.viewDidLoad()
        collectionView.backgroundColor = sheetBackground
        frostedBar(for: self)
        navigationItem.rightBarButtonItem = closeButton(for: self)
        navigationItem.leftBarButtonItem = modeToggle
        modeToggle.isSelected = mode == .abbreviations

        let search = UISearchController(searchResultsController: nil)
        search.searchResultsUpdater = self
        search.obscuresBackgroundDuringPresentation = false
        search.searchBar.placeholder = "Filtrar livros"
        navigationItem.searchController = search
        navigationItem.hidesSearchBarWhenScrolling = false

        let tile = UICollectionView.CellRegistration<TileCell, Book> {
            [weak self, currentBookId = data.currentBookId] cell, _, book in
            let compact = self?.mode == .abbreviations
            cell.configure(text: compact ? book.abbreviation : book.label,
                           style: compact ? .headline : .subheadline,
                           current: book.id == currentBookId, accessibilityLabel: book.name)
        }
        let header = UICollectionView.SupplementaryRegistration<UICollectionViewListCell>(
            elementKind: UICollectionView.elementKindSectionHeader
        ) { [weak self] cell, _, indexPath in
            var content: UIListContentConfiguration
            if #available(iOS 18.0, *) {
                content = .header()
            } else {
                content = .groupedHeader()
            }
            content.text = self?.dataSource.snapshot().sectionIdentifiers[indexPath.section]
            content.directionalLayoutMargins.leading = 4
            cell.contentConfiguration = content
        }

        dataSource = UICollectionViewDiffableDataSource(collectionView: collectionView) { view, indexPath, book in
            view.dequeueConfiguredReusableCell(using: tile, for: indexPath, item: book)
        }
        dataSource.supplementaryViewProvider = { view, _, indexPath in
            view.dequeueConfiguredReusableSupplementary(using: header, for: indexPath)
        }
        show(filter: "")
    }

    /// Once only: coming Back from another book's chapters keeps the list where it was.
    private var scrolledToCurrent = false

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        guard !scrolledToCurrent else { return }
        scrolledToCurrent = true
        // Animated: this runs once the sheet or the Back transition has settled,
        // so an unanimated scroll shows as a jump. Not to "Sobre a Bíblia",
        // listed after Apocalipse: from there the reader is choosing where to
        // start, and the list opens at Génesis, its tile still highlighted.
        if let current = data.currentBook, current.id != "about",
           let indexPath = dataSource.indexPath(for: current) {
            collectionView.revealItem(at: indexPath)
        }
    }

    func updateSearchResults(for searchController: UISearchController) {
        show(filter: searchController.searchBar.text ?? "")
    }

    /// Abbreviations on or off, in one tap; highlighted while on.
    private lazy var modeToggle: UIBarButtonItem = {
        let item = UIBarButtonItem(image: UIImage(systemName: "square.grid.3x3"), primaryAction: UIAction {
            [weak self] _ in
            guard let self else { return }
            self.setMode(self.mode == .names ? .abbreviations : .names)
        })
        item.accessibilityLabel = "Abreviaturas"
        return item
    }()

    private func setMode(_ new: Mode) {
        guard new != mode else { return }
        mode = new
        UserDefaults.standard.set(new.rawValue, forKey: Self.modeKey)
        modeToggle.isSelected = new == .abbreviations
        UIView.transition(with: collectionView, duration: 0.25, options: .transitionCrossDissolve) {
            self.collectionView.setCollectionViewLayout(Self.layout(for: new), animated: false)
            self.dataSource.applySnapshotUsingReloadData(self.dataSource.snapshot())
        }
    }

    private func show(filter: String) {
        let query = filter.trimmingCharacters(in: .whitespaces)
        func matches(_ book: Book) -> Bool {
            query.isEmpty || [book.label, book.name, book.abbreviation].contains {
                $0.range(of: query, options: [.caseInsensitive, .diacriticInsensitive]) != nil
            }
        }

        var snapshot = NSDiffableDataSourceSnapshot<String, Book>()
        for testament in data.sections {
            for group in testament.groups {
                let books = group.books.filter(matches)
                guard !books.isEmpty else { continue }
                // The testament's own introduction sits under the testament's name.
                let title = group.title ?? testament.title
                guard !snapshot.sectionIdentifiers.contains(title) else { continue }
                snapshot.appendSections([title])
                snapshot.appendItems(books, toSection: title)
            }
        }
        dataSource.applySnapshotUsingReloadData(snapshot)
    }

    override func collectionView(_ collectionView: UICollectionView, didSelectItemAt indexPath: IndexPath) {
        guard let book = dataSource.itemIdentifier(for: indexPath) else { return }
        if book.chapters.isEmpty {
            onSelect?(book.id, nil)
        } else {
            navigationController?.pushViewController(chapterList(for: book), animated: true)
        }
        collectionView.deselectItem(at: indexPath, animated: true)
    }

    func chapterList(for book: Book) -> UIViewController {
        let current = book.id == data.currentBookId ? data.currentChapter : nil
        return ChapterListViewController(book: book, current: current) { [weak self] chapter in
            self?.onSelect?(book.id, chapter)
        }
    }
}

/// A grid of chapter numbers, the introduction first across the full width.
/// The section titles don't fit a tile: VoiceOver reads them, and a long press
/// shows them.
private final class ChapterListViewController: UICollectionViewController {
    typealias Chapter = PassagePickerData.Chapter

    private let book: PassagePickerData.Book
    private let current: Int?
    private let onSelect: (Int) -> Void
    private var dataSource: UICollectionViewDiffableDataSource<Int, Chapter>!

    init(book: PassagePickerData.Book, current: Int?, onSelect: @escaping (Int) -> Void) {
        self.book = book
        self.current = current
        self.onSelect = onSelect
        let layout = UICollectionViewCompositionalLayout { section, environment in
            // Section 0 is the introduction, alone on its row.
            section == 0 && book.chapters.first?.label.isEmpty == true
                ? tileSection(environment, minWidth: .greatestFiniteMagnitude, height: 48)
                : tileSection(environment, minWidth: 52, height: 48)
        }
        super.init(collectionViewLayout: layout)
        title = book.name
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

    override func viewDidLoad() {
        super.viewDidLoad()
        collectionView.backgroundColor = sheetBackground
        frostedBar(for: self)
        navigationItem.rightBarButtonItem = closeButton(for: self)

        let tile = UICollectionView.CellRegistration<TileCell, Chapter> { [current] cell, _, chapter in
            let isIntro = chapter.label.isEmpty
            cell.configure(
                text: isIntro ? "Introdução" : chapter.label,
                detail: chapter.detail,
                style: isIntro ? .body : .headline,
                current: chapter.number == current,
                ribbon: chapter.bookmark.flatMap(chapter.number == current ? ribbonColorOnSelection : ribbonColor),
                accessibilityLabel: Self.spokenLabel(for: chapter))
        }
        dataSource = UICollectionViewDiffableDataSource(collectionView: collectionView) { view, indexPath, chapter in
            view.dequeueConfiguredReusableCell(using: tile, for: indexPath, item: chapter)
        }
        var snapshot = NSDiffableDataSourceSnapshot<Int, Chapter>()
        let intro = book.chapters.filter { $0.label.isEmpty }
        let numbered = book.chapters.filter { !$0.label.isEmpty }
        if !intro.isEmpty {
            snapshot.appendSections([0])
            snapshot.appendItems(intro, toSection: 0)
        }
        snapshot.appendSections([1])
        snapshot.appendItems(numbered, toSection: 1)
        dataSource.apply(snapshot, animatingDifferences: false)
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        if let current, let chapter = book.chapters.first(where: { $0.number == current }),
           let indexPath = dataSource.indexPath(for: chapter) {
            collectionView.revealItem(at: indexPath)
        }
    }

    override func collectionView(_ collectionView: UICollectionView, didSelectItemAt indexPath: IndexPath) {
        if let chapter = dataSource.itemIdentifier(for: indexPath) {
            onSelect(chapter.number)
        }
    }

    /// A long press shows the chapter's section title, which the tile has no room for.
    override func collectionView(_ collectionView: UICollectionView,
                                 contextMenuConfigurationForItemsAt indexPaths: [IndexPath],
                                 point: CGPoint) -> UIContextMenuConfiguration? {
        guard let indexPath = indexPaths.first, let chapter = dataSource.itemIdentifier(for: indexPath),
              let title = chapter.title, !chapter.label.isEmpty else { return nil }
        return UIContextMenuConfiguration(actionProvider: { [weak self] _ in
            UIMenu(title: "\(chapter.label) · \(title)", children: [
                UIAction(title: "Abrir", image: UIImage(systemName: "book")) { _ in
                    self?.onSelect(chapter.number)
                },
            ])
        })
    }

    private static func spokenLabel(for chapter: Chapter) -> String {
        guard !chapter.label.isEmpty else { return chapter.title ?? "Introdução" }
        var label = chapter.spoken ?? "Capítulo \(chapter.label)"
        if let title = chapter.title, !title.isEmpty { label += ", \(title)" }
        if chapter.bookmark != nil { label += ", com marcador" }
        return label
    }

}

/// A rounded tile: a book or a chapter number. The current one is filled with
/// the text colour, inverted; a bookmarked chapter shows its ribbon colour as a
/// dot, ringed in the sheet's colour so that it shows on either fill.
private final class TileCell: UICollectionViewCell {
    private let label = UILabel()
    /// A second, smaller line: a psalm's liturgical number.
    private let detailLabel = UILabel()
    private let ribbon = UIView()
    private let ribbonRing = UIView()

    override init(frame: CGRect) {
        super.init(frame: frame)
        contentView.layer.cornerRadius = 12
        contentView.layer.cornerCurve = .continuous
        label.textAlignment = .center
        // Long names take two lines ("Atos dos / Apóstolos"). A word too wide
        // for the tile shrinks instead of breaking (`fitText`), and a number
        // keeps to its book ("1 Tessalonicenses" shrinks on one line).
        label.numberOfLines = 2
        label.adjustsFontSizeToFitWidth = true
        label.minimumScaleFactor = 0.65
        detailLabel.textAlignment = .center
        detailLabel.font = .preferredFont(forTextStyle: .caption2)
        detailLabel.adjustsFontForContentSizeCategory = true
        detailLabel.isHidden = true
        let lines = UIStackView(arrangedSubviews: [label, detailLabel])
        lines.axis = .vertical
        lines.alignment = .fill
        lines.translatesAutoresizingMaskIntoConstraints = false
        ribbon.layer.cornerRadius = 5
        ribbon.translatesAutoresizingMaskIntoConstraints = false
        ribbonRing.layer.cornerRadius = 7
        ribbonRing.backgroundColor = sheetBackground
        ribbonRing.translatesAutoresizingMaskIntoConstraints = false
        contentView.addSubview(lines)
        contentView.addSubview(ribbonRing)
        contentView.addSubview(ribbon)
        NSLayoutConstraint.activate([
            lines.leadingAnchor.constraint(equalTo: contentView.leadingAnchor, constant: 6),
            lines.trailingAnchor.constraint(equalTo: contentView.trailingAnchor, constant: -6),
            lines.centerYAnchor.constraint(equalTo: contentView.centerYAnchor),
            ribbonRing.widthAnchor.constraint(equalToConstant: 14),
            ribbonRing.heightAnchor.constraint(equalToConstant: 14),
            ribbonRing.topAnchor.constraint(equalTo: contentView.topAnchor, constant: 4),
            ribbonRing.trailingAnchor.constraint(equalTo: contentView.trailingAnchor, constant: -4),
            ribbon.widthAnchor.constraint(equalToConstant: 10),
            ribbon.heightAnchor.constraint(equalToConstant: 10),
            ribbon.centerXAnchor.constraint(equalTo: ribbonRing.centerXAnchor),
            ribbon.centerYAnchor.constraint(equalTo: ribbonRing.centerYAnchor),
        ])
        isAccessibilityElement = true
        accessibilityTraits = .button
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

    func configure(text: String, detail: String? = nil, style: UIFont.TextStyle, current: Bool,
                   ribbon color: UIColor? = nil, accessibilityLabel: String) {
        label.text = text.replacingOccurrences(of: #"^(\d) "#, with: "$1\u{00A0}", options: .regularExpression)
        textStyle = style
        fitText()
        label.textColor = current ? ChromeViewController.onSelection : .label
        detailLabel.text = detail.map { "(\($0))" }
        detailLabel.isHidden = detail == nil
        detailLabel.textColor = current ? ChromeViewController.onSelection.withAlphaComponent(0.7) : .secondaryLabel
        contentView.backgroundColor = current ? ChromeViewController.selectionFill : tileBackground
        ribbon.backgroundColor = color
        ribbon.isHidden = color == nil
        ribbonRing.isHidden = color == nil
        self.accessibilityLabel = accessibilityLabel
        accessibilityTraits = current ? [.button, .selected] : .button
    }

    override var isHighlighted: Bool {
        didSet { contentView.alpha = isHighlighted ? 0.55 : 1 }
    }

    private var textStyle: UIFont.TextStyle = .body

    override func layoutSubviews() {
        super.layoutSubviews()
        fitText()
    }

    /// The style's font, made smaller if a word is wider than the tile: a label
    /// that shrinks to fit two lines would break the word across them first.
    private func fitText() {
        let words = (label.text ?? "").split(separator: " ")
        func widest(_ font: UIFont) -> CGFloat {
            words.map { ceil(($0 as NSString).size(withAttributes: [.font: font]).width) }.max() ?? 0
        }
        let room = contentView.bounds.width - 12
        var font = limitedFont(textStyle)
        if room > 0, widest(font) > room {
            // Measured at each size, not scaled in proportion: SF spaces its
            // letters wider as it gets smaller, and "2 Tessalonicenses" broke.
            font = font.withSize((font.pointSize * room / widest(font) * 2).rounded(.down) / 2)
            while widest(font) > room, font.pointSize > 6 {
                font = font.withSize(font.pointSize - 0.5)
            }
        }
        if label.font != font { label.font = font }
    }
}

/// A grid section: as many columns of at least `minWidth` as fit.
private func tileSection(_ environment: NSCollectionLayoutEnvironment, minWidth: CGFloat, height: CGFloat,
                         trailing: CGFloat = 16) -> NSCollectionLayoutSection {
    let spacing: CGFloat = 8
    // Tiles grow with their text, to its limit: fewer to a row, none cut short.
    let scale = min(UIFontMetrics(forTextStyle: .headline)
        .scaledValue(for: 1, compatibleWith: environment.traitCollection), tileTextScaleLimit)
    let minWidth = minWidth * scale
    let height = height * scale
    let available = environment.container.effectiveContentSize.width - 16 - trailing
    let columns = max(1, Int((available + spacing) / (minWidth + spacing)))
    // Spacing as item insets: fractional widths must add up to the row exactly.
    let item = NSCollectionLayoutItem(layoutSize: .init(widthDimension: .fractionalWidth(1 / CGFloat(columns)),
                                                         heightDimension: .fractionalHeight(1)))
    item.contentInsets = NSDirectionalEdgeInsets(top: spacing / 2, leading: spacing / 2,
                                                 bottom: spacing / 2, trailing: spacing / 2)
    let group = NSCollectionLayoutGroup.horizontal(
        layoutSize: .init(widthDimension: .fractionalWidth(1), heightDimension: .absolute(height + spacing)),
        subitems: [item])
    let section = NSCollectionLayoutSection(group: group)
    section.contentInsets = NSDirectionalEdgeInsets(top: 0, leading: 16 - spacing / 2, bottom: 16,
                                                    trailing: trailing - spacing / 2)
    return section
}

/// The book grid, with a header above each canon group.
private func tileLayout(minWidth: CGFloat, height: CGFloat) -> UICollectionViewLayout {
    UICollectionViewCompositionalLayout { _, environment in
        let section = tileSection(environment, minWidth: minWidth, height: height)
        let header = NSCollectionLayoutBoundarySupplementaryItem(
            layoutSize: .init(widthDimension: .fractionalWidth(1), heightDimension: .estimated(36)),
            elementKind: UICollectionView.elementKindSectionHeader, alignment: .top)
        section.boundarySupplementaryItems = [header]
        return section
    }
}

// Explicit colours: in a glass sheet the system background colours resolve to
// clear, which left the page showing through and the text hard to read.
// Lists and text sit on the system's plain sheet colours (white, or the
// elevated dark grey), as in Apple's own pickers; tiles take the secondary one.
let sheetBackground = UIColor { traits in
    traits.userInterfaceStyle == .dark
        ? UIColor(red: 0.11, green: 0.11, blue: 0.12, alpha: 1)
        : UIColor.white
}

let tileBackground = UIColor { traits in
    traits.userInterfaceStyle == .dark
        ? UIColor(red: 0.17, green: 0.17, blue: 0.18, alpha: 1)
        : UIColor(red: 0.95, green: 0.95, blue: 0.97, alpha: 1)
}

// A form keeps the grouped colours, white rows on grey, as Settings does.
let formBackground = UIColor { traits in
    traits.userInterfaceStyle == .dark
        ? UIColor(white: 0, alpha: 1)
        : UIColor(red: 0.95, green: 0.95, blue: 0.97, alpha: 1)
}

let formRowBackground = UIColor { traits in
    traits.userInterfaceStyle == .dark
        ? UIColor(red: 0.11, green: 0.11, blue: 0.12, alpha: 1)
        : UIColor.white
}

private extension UICollectionView {
    /// Scrolls the item to the middle, unless it is in full view already.
    /// Centring one near the top moved the list a short way, leaving the first
    /// section header under the bar. On the iPhone Duo's outer screen the
    /// title is on the left, as the headers are, and it doesn't scroll away
    /// for a scroll the app makes after Back, so "Livros" was drawn right over
    /// "Antigo Testamento".
    func revealItem(at indexPath: IndexPath) {
        let visible = bounds.inset(by: adjustedContentInset)
        if let item = layoutAttributesForItem(at: indexPath), visible.contains(item.frame) { return }
        scrollToItem(at: indexPath, at: .centeredVertically, animated: true)
    }
}

/// What scrolls under the bar is frosted, as in a material bar, so no tile
/// shows behind the title and buttons: the scroll edge effect alone, soft or
/// hard, left them readable there. Its soft fade still eases the band's lower
/// edge. At the top of the list the bar is clear, part of the sheet.
private func frostedBar(for controller: UICollectionViewController) {
    let frosted = UINavigationBarAppearance()
    frosted.configureWithDefaultBackground()
    frosted.backgroundEffect = UIBlurEffect(style: .systemMaterial)
    frosted.shadowColor = .clear
    let clear = UINavigationBarAppearance()
    clear.configureWithTransparentBackground()
    controller.navigationItem.standardAppearance = frosted
    controller.navigationItem.scrollEdgeAppearance = clear
    if #available(iOS 26.0, *) {
        controller.collectionView.topEdgeEffect.style = .soft
    }
}

/// How far text in a tile, a bar or a toast grows with the reader's text
/// size: to twice the standard size. The largest accessibility sizes (AX5 is
/// over three times) would overflow them; Apple's own bars stop sooner still.
let tileTextScaleLimit: CGFloat = 2

/// `font`, at the standard text size, scaled as `style` is, up to `limit`
/// times its size.
func limitedFont(_ font: UIFont, _ style: UIFont.TextStyle, limit: CGFloat = tileTextScaleLimit) -> UIFont {
    UIFontMetrics(forTextStyle: style).scaledFont(for: font, maximumPointSize: font.pointSize * limit)
}

/// `style`'s own font, scaled up to `limit` times its standard size.
func limitedFont(_ style: UIFont.TextStyle, limit: CGFloat = tileTextScaleLimit) -> UIFont {
    let standard = UITraitCollection(preferredContentSizeCategory: .large)
    return limitedFont(.preferredFont(forTextStyle: style, compatibleWith: standard), style, limit: limit)
}

func closeButton(for controller: UIViewController) -> UIBarButtonItem {
    UIBarButtonItem(systemItem: .close, primaryAction: UIAction { [weak controller] _ in
        controller?.dismiss(animated: true)
    })
}
