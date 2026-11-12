import Capacitor
import XCTest

@testable import App

/// What the web app sends the bars (native-chrome.service.ts), as ChromeState
/// reads it. The payloads in native-contract/ are shared with the Android and
/// web tests. The iOS bars ignore `scrolled`, `subtitle`, `textSize` and
/// `pageColor`, which only the Android bars use.
final class ChromeStateTests: XCTestCase {
    // The bridge coerces what the web view sends the same way.
    private func call(_ options: [String: Any]) -> CAPPluginCall {
        CAPPluginCall(
            callbackId: "1", methodName: "setState",
            options: JSTypes.coerceDictionaryToJSObject(options) ?? [:], success: { _, _ in }, error: { _ in })!
    }

    private func state(_ options: [String: Any]) -> ChromeState {
        ChromeState(call(options))
    }

    private func fixture(_ name: String) throws -> ChromeState {
        let url = try XCTUnwrap(
            Bundle(for: Self.self).url(forResource: name, withExtension: "json", subdirectory: "native-contract"))
        let json = try JSONSerialization.jsonObject(with: Data(contentsOf: url))
        return state(try XCTUnwrap(json as? [String: Any]))
    }

    // MARK: The shared payloads

    func testReadsTheReader() throws {
        let state = try fixture("reader")
        XCTAssertEqual(state.mode, .reader)
        XCTAssertEqual(state.themeMode, "dark")
        XCTAssertEqual(state.passageLabel, "Deuteronómio 3")
        XCTAssertEqual(state.passageShortLabels, ["Dt 3"])
        XCTAssertEqual(state.passageAccessibilityLabel, "Deuteronómio, capítulo 3")
        XCTAssertTrue(state.chapterNavigation)
        XCTAssertTrue(state.canGoPrevious)
        XCTAssertTrue(state.canGoNext)
        XCTAssertTrue(state.search)
        XCTAssertEqual(state.viewMode, "paged")
        XCTAssertEqual(state.raggedText, true)
        XCTAssertTrue(state.autoScrollVisible)
        XCTAssertTrue(state.autoScrollAvailable)
        XCTAssertTrue(state.canShare)
        XCTAssertTrue(state.canReport)
        XCTAssertEqual(state.bookmarkColor, "red")
        XCTAssertEqual(state.bookmarkName, "vermelho")
        XCTAssertEqual(state.buildVersion, "20261018-120000Z")
        XCTAssertTrue(state.inert)
        XCTAssertTrue(state.collapsed)
        let autoScroll = try XCTUnwrap(state.autoScroll)
        XCTAssertTrue(autoScroll.playing)
        XCTAssertEqual(autoScroll.speedLabel, "1,5")
        XCTAssertEqual(autoScroll.speedAccessibilityLabel, "1,5 linhas por segundo")
        XCTAssertTrue(autoScroll.canSlower)
        XCTAssertTrue(autoScroll.canFaster)
        XCTAssertFalse(autoScroll.canPlay)
    }

    func testReadsTheReaderWithNothingOptional() throws {
        let state = try fixture("reader-minimal")
        XCTAssertEqual(state.mode, .reader)
        XCTAssertEqual(state.themeMode, "system")
        XCTAssertEqual(state.passageLabel, "Génesis 1")
        XCTAssertEqual(state.passageShortLabels, [])
        XCTAssertEqual(state.passageAccessibilityLabel, "Génesis 1")
        XCTAssertFalse(state.chapterNavigation)
        XCTAssertFalse(state.search)
        XCTAssertNil(state.viewMode)
        XCTAssertNil(state.raggedText)
        XCTAssertNil(state.bookmarkColor)
        XCTAssertNil(state.bookmarkName)
        XCTAssertNil(state.buildVersion)
        XCTAssertNil(state.autoScroll)
    }

    func testReadsTheSearchPage() throws {
        let state = try fixture("search")
        XCTAssertEqual(state.mode, .search)
        XCTAssertEqual(state.themeMode, "dark")
        XCTAssertEqual(state.query, "amor")
        XCTAssertTrue(state.inert)
    }

    func testReadsAPlainPage() throws {
        let state = try fixture("page")
        XCTAssertEqual(state.mode, .page)
        XCTAssertEqual(state.themeMode, "light")
        XCTAssertEqual(state.title, "Livros")
        XCTAssertTrue(state.search)
    }

    func testReadsAPageWithAFilter() throws {
        let state = try fixture("reader-filter")
        XCTAssertEqual(state.mode, .reader)
        XCTAssertEqual(state.passageLabel, "Índice Bíblico-Pastoral")
        XCTAssertEqual(state.filterPlaceholder, "Filtrar temas")
        XCTAssertTrue(state.filterOpen)
        XCTAssertEqual(state.query, "amor")
        XCTAssertTrue(state.showsSearchField)
        XCTAssertFalse(state.chapterNavigation)
    }

    func testTheFilterKeepsWhatIsTypedFromItsEcho() {
        let open = state(["mode": "reader", "filterPlaceholder": "Filtrar temas", "filterOpen": true, "query": "am"])
        let echo = state(["mode": "reader", "filterPlaceholder": "Filtrar temas", "filterOpen": true, "query": "a"])
        let cleared = state(["mode": "reader", "filterPlaceholder": "Filtrar temas", "filterOpen": true, "query": ""])
        let closed = state(["mode": "reader", "filterPlaceholder": "Filtrar temas"])
        XCTAssertEqual(ChromeState.filterText(from: closed, to: open, editing: false), "am")
        XCTAssertNil(ChromeState.filterText(from: open, to: echo, editing: true))
        XCTAssertEqual(ChromeState.filterText(from: open, to: echo, editing: false), "a")
        XCTAssertEqual(ChromeState.filterText(from: open, to: cleared, editing: true), "")
        XCTAssertNil(ChromeState.filterText(from: open, to: open, editing: false))
    }

    func testSearchFromTheFilterTakesTheKeyboard() {
        let filter = state(["mode": "reader", "filterPlaceholder": "Filtrar temas", "filterOpen": true])
        let search = state(["mode": "search"])
        let reader = state(["mode": "reader"])
        XCTAssertTrue(ChromeState.focusesSearchField(from: filter, to: search))
        XCTAssertTrue(ChromeState.focusesSearchField(from: reader, to: filter))
        XCTAssertFalse(ChromeState.focusesSearchField(from: filter, to: filter))
        XCTAssertFalse(ChromeState.focusesSearchField(from: search, to: search))
        XCTAssertFalse(ChromeState.focusesSearchField(from: filter, to: reader))
    }

    func testAPageWithoutAFilterHasNoSearchField() throws {
        let state = try fixture("reader")
        XCTAssertNil(state.filterPlaceholder)
        XCTAssertFalse(state.showsSearchField)
    }

    func testAnEntryWithNoGroupAfterTheTestamentsIntroKeepsItsOwnSection() {
        let book = { (id: String, name: String) in
            PassagePickerData.Book(id: id, label: name, name: name, abbreviation: id, chapters: [])
        }
        let intro = PassagePickerData.Group(title: nil, books: [book("nt", "Introdução")])
        let index = PassagePickerData.Group(title: nil, books: [book("indice", "Índice Bíblico-Pastoral")])
        let titled = PassagePickerData.Group(title: "Apocalipse", books: [book("ap", "Apocalipse")])
        let testament = PassagePickerData.Section(title: "Novo Testamento", groups: [intro, titled, index])
        XCTAssertEqual(PassagePickerData.sectionTitle(of: intro, in: testament, showing: intro.books, taken: []),
                       "Novo Testamento")
        XCTAssertEqual(PassagePickerData.sectionTitle(of: titled, in: testament, showing: titled.books,
                                                      taken: ["Novo Testamento"]), "Apocalipse")
        XCTAssertEqual(PassagePickerData.sectionTitle(of: index, in: testament, showing: index.books,
                                                      taken: ["Novo Testamento", "Apocalipse"]),
                       "Índice Bíblico-Pastoral")
    }

    func testAToastOffersItsButtonOnlyWhileItIsOne() {
        let toast = ToastView()
        XCTAssertNil(toast.activeButton)
        toast.show("Copiado")
        XCTAssertNil(toast.activeButton)

        var tapped = false
        toast.show("Voltar para o Índice", symbol: "arrow.uturn.backward") { tapped = true }
        XCTAssertEqual(toast.activeButton?.message, "Voltar para o Índice")
        XCTAssertEqual(toast.activeButton?.symbol, "arrow.uturn.backward")

        toast.tapped()
        XCTAssertTrue(tapped)
        XCTAssertNil(toast.activeButton)
    }

    // At the largest text sizes "Voltar para o Índice" was truncated to one line.
    func testAToastButtonWrapsRatherThanTruncating() throws {
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 402, height: 874))
        let toast = ToastView()
        toast.translatesAutoresizingMaskIntoConstraints = false
        window.addSubview(toast)
        NSLayoutConstraint.activate([
            toast.widthAnchor.constraint(lessThanOrEqualToConstant: 180),
            toast.centerXAnchor.constraint(equalTo: window.centerXAnchor),
            toast.centerYAnchor.constraint(equalTo: window.centerYAnchor),
        ])
        window.isHidden = false
        toast.show("Voltar para o Índice Bíblico-Pastoral", symbol: "arrow.uturn.backward", onTap: {})
        window.layoutIfNeeded()

        let button = try XCTUnwrap(subviews(of: toast, UIButton.self).first { $0.configuration?.title == "Voltar para o Índice Bíblico-Pastoral" })
        let title = try XCTUnwrap(button.titleLabel)
        XCTAssertGreaterThan(title.bounds.height, title.font.lineHeight * 1.5)
    }

    func testTheNotesWayBackWrapsAtTheRoomItHas() {
        var config = UIButton.Configuration.plain()
        config.title = "Voltar para o Índice Bíblico-Pastoral"
        config.titleLineBreakMode = .byWordWrapping
        let button = UIButton(configuration: config)
        let line = FootnotesController.wayBackSize(button, room: 1000)
        let wrapped = FootnotesController.wayBackSize(button, room: 150)
        XCTAssertLessThanOrEqual(wrapped.width, 150)
        XCTAssertGreaterThan(wrapped.height, line.height * 1.5)
    }

    // Wrapped, a capsule's radius (half its height) put the lines' ends outside the glass.
    func testTheNotesWayBackIsACapsuleOnlyOnOneLine() {
        func capsule() -> UIButton {
            var config = UIButton.Configuration.plain()
            config.title = "Voltar para o Índice Bíblico-Pastoral"
            config.titleLineBreakMode = .byWordWrapping
            config.cornerStyle = .capsule
            return UIButton(configuration: config)
        }
        let line = capsule()
        FootnotesController.fitWayBack(line, room: 1000)
        XCTAssertEqual(line.configuration?.cornerStyle, .capsule)

        let wrapped = capsule()
        FootnotesController.fitWayBack(wrapped, room: 150)
        XCTAssertGreaterThan(wrapped.frame.height, 48)
        XCTAssertEqual(wrapped.configuration?.cornerStyle, .fixed)
        XCTAssertEqual(wrapped.configuration?.background.cornerRadius, 24)

        // At the sheet's foot it covered the last note: the inset grows with it.
        XCTAssertEqual(FootnotesController.notesBottomInset(wayBackHeight: line.frame.height), 88)
        XCTAssertGreaterThanOrEqual(FootnotesController.notesBottomInset(wayBackHeight: wrapped.frame.height),
                                    wrapped.frame.height + 12 + 28)
    }

    func testAToastClosedOffersNothing() {
        let toast = ToastView()
        toast.show("Voltar para o Índice", onTap: {})
        toast.dismissNow()
        XCTAssertNil(toast.activeButton)
    }

    private let wayBackSize = CGSize(width: 200, height: 44)
    private let screen = CGRect(x: 0, y: 0, width: 402, height: 874)
    private let phoneSafeArea = UIEdgeInsets(top: 62, left: 0, bottom: 34, right: 0)

    func testTheWayBackFloatsAboveAHalfHeightSheet() {
        let sheet = CGRect(x: 0, y: 430, width: 402, height: 444)
        let center = FootnotesController.wayBackCenter(sheet: sheet, size: wayBackSize,
                                                       container: screen, safeArea: phoneSafeArea)
        // Its lower edge clears the sheet's top.
        XCTAssertEqual(center.y + wayBackSize.height / 2, sheet.minY - 12)
        XCTAssertEqual(center.x, sheet.midX)
    }

    func testTheWayBackStaysAtTheFootOfASheetThatFillsTheScreen() {
        let sheet = CGRect(x: 0, y: 72, width: 402, height: 802)
        let center = FootnotesController.wayBackCenter(sheet: sheet, size: wayBackSize,
                                                       container: screen, safeArea: phoneSafeArea)
        XCTAssertEqual(center.y + wayBackSize.height / 2, screen.maxY - phoneSafeArea.bottom - 12)
    }

    func testTheWayBackStaysOnScreenWhenASheetRunsPastItsFoot() {
        let sheet = CGRect(x: 0, y: 72, width: 402, height: 1200)
        let center = FootnotesController.wayBackCenter(sheet: sheet, size: wayBackSize,
                                                       container: screen, safeArea: phoneSafeArea)
        XCTAssertLessThan(center.y + wayBackSize.height / 2, screen.maxY)
    }

    func testReadsNoBars() throws {
        XCTAssertEqual(try fixture("none"), ChromeState())
    }

    // MARK: Defaults and malformed input

    func testNothingSentIsAnEmptyInactiveState() {
        XCTAssertEqual(state([:]), ChromeState())
        XCTAssertEqual(ChromeState().themeMode, "system")
    }

    func testAnUnknownModeHidesTheBars() {
        XCTAssertEqual(state(["mode": "carousel"]).mode, .none)
    }

    // Spoken as shown, when no spoken form comes.
    func testThePassageIsSpokenAsShownByDefault() {
        XCTAssertEqual(state(["passageLabel": "Mt 5"]).passageAccessibilityLabel, "Mt 5")
        XCTAssertEqual(state(["passageLabel": "Mt 5", "passageAccessibilityLabel": "Mateus 5"]).passageAccessibilityLabel, "Mateus 5")
    }

    func testNullIsAbsent() {
        let state = state(["mode": "reader", "viewMode": NSNull(), "bookmarkColor": NSNull(), "buildVersion": NSNull(), "autoScroll": NSNull()])
        XCTAssertEqual(state.mode, .reader)
        XCTAssertNil(state.viewMode)
        XCTAssertNil(state.bookmarkColor)
        XCTAssertNil(state.buildVersion)
        XCTAssertNil(state.autoScroll)
    }

    func testValuesOfTheWrongTypeFallBackToTheDefaults() {
        let state = state([
            "mode": 3, "inert": "yes", "themeMode": false, "passageLabel": 1, "passageShortLabels": "Dt 3",
            "canGoNext": "yes", "viewMode": 5, "query": ["amor"], "autoScroll": "playing",
        ])
        XCTAssertEqual(state, ChromeState())
    }

    // At the page's end there's nothing to play; older web bundles don't say.
    func testAutoScrollCanPlayUnlessTheEndIsReached() {
        let atEnd = state(["autoScroll": ["playing": false, "speedLabel": "1", "canPlay": false]]).autoScroll
        XCTAssertEqual(atEnd?.canPlay, false)
        let older = state(["autoScroll": ["playing": false, "speedLabel": "1"]]).autoScroll
        XCTAssertEqual(older?.canPlay, true)
    }

    func testAutoScrollIsSpokenAsShownByDefault() throws {
        let autoScroll = try XCTUnwrap(state(["autoScroll": ["speedLabel": "2"]]).autoScroll)
        XCTAssertEqual(autoScroll.speedAccessibilityLabel, "2")
        XCTAssertFalse(autoScroll.playing)
        XCTAssertFalse(autoScroll.canSlower)
        XCTAssertFalse(autoScroll.canFaster)
    }

    // MARK: Onboarding

    // A page naming a bar button shows that button, ringed, instead of its symbol.
    func testReadsTheButtonAnOnboardingPageNames() {
        let steps = OnboardingStepData.parse(call(["steps": [
            ["id": "books", "title": "Escolher um livro", "intro": "…", "symbol": "book",
             "logo": false, "highlight": "passage", "features": []],
            ["id": "welcome", "title": "Bem-vindo", "intro": "…", "symbol": "book",
             "logo": true, "features": []],
        ]]))
        XCTAssertEqual(steps.map(\.highlight), ["passage", nil])
    }

    // The copy is decoration: VoiceOver skips it and taps don't reach it.
    // The ring goes round the item in the toolbar's middle, not the bar.
    func testRingsTheButtonInTheMiddleOfItsBar() {
        let bar = UIToolbar()
        bar.items = [.flexibleSpace(), UIBarButtonItem(image: UIImage(systemName: "magnifyingglass")), .flexibleSpace()]
        let ringed = RingedBarButton(bar)
        // The bar lays its item out only in a window.
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 402, height: 874))
        window.addSubview(ringed)
        window.isHidden = false
        ringed.frame = CGRect(x: 0, y: 0, width: 402, height: 120)
        ringed.layoutIfNeeded()
        RunLoop.main.run(until: Date().addingTimeInterval(0.3))
        ringed.layoutIfNeeded()
        XCTAssertTrue(ringed.accessibilityElementsHidden)
        XCTAssertFalse(ringed.isUserInteractionEnabled)
        let button = ringed.buttonFrame
        XCTAssertLessThan(button.width, 120)
        XCTAssertEqual(button.midX, 201, accuracy: 2)
    }

    // On the iPhone Duo a turn left the ring round the whole bar, a capsule
    // the screen's width: the bar (SwiftUI-hosted) lays its item out for the
    // new width after the ring's own layout, with the item still at the old
    // middle. A bar that does the same, a turn of the run loop late:
    final class LateBar: UIView {
        let item = UIView()
        let itemWidth: CGFloat
        init(itemWidth: CGFloat = 48) {
            self.itemWidth = itemWidth
            super.init(frame: .zero)
            addSubview(item)
        }
        required init?(coder: NSCoder) { fatalError() }
        override func layoutSubviews() {
            super.layoutSubviews()
            let width = bounds.width
            DispatchQueue.main.async { [self] in
                item.frame = CGRect(x: (width - itemWidth) / 2, y: 0, width: itemWidth, height: 48)
            }
        }
    }

    func testRingsTheButtonOnceTheBarHasLaidItOutAfterATurn() {
        let bar = LateBar()
        let ringed = RingedBarButton(bar)
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 678, height: 678))
        window.addSubview(ringed)
        window.isHidden = false
        for width in [CGFloat(454), 530] {
            ringed.frame = CGRect(x: 0, y: 0, width: width, height: 88)
            ringed.layoutIfNeeded()
            RunLoop.main.run(until: Date().addingTimeInterval(0.3))
        }

        let rings = ringed.subviews.filter { $0 !== bar }.map(\.frame)
        XCTAssertFalse(rings.isEmpty)
        for ring in rings {
            XCTAssertEqual(ring.width, 60, accuracy: 1, "the ring went round the bar")
            XCTAssertEqual(ring.midX, 265, accuracy: 1)
        }
    }

    // On iPad the passage's glass is wider than half the bar: still the glass,
    // not the label inside it.
    func testRingsAPassageWiderThanHalfTheBar() {
        let label = UIButton(configuration: .plain())
        label.configuration?.title = "Sobre a Bíblia dos Capuchinhos"
        let bar = UIToolbar()
        bar.items = [.flexibleSpace(), UIBarButtonItem(customView: label), .flexibleSpace()]
        let ringed = RingedBarButton(bar)
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 400, height: 874))
        window.addSubview(ringed)
        window.isHidden = false
        ringed.frame = CGRect(x: 0, y: 0, width: 400, height: 120)
        ringed.layoutIfNeeded()
        RunLoop.main.run(until: Date().addingTimeInterval(0.3))
        ringed.layoutIfNeeded()
        let glass = ringed.buttonFrame
        let text = label.convert(label.bounds, to: ringed)
        XCTAssertGreaterThan(glass.width, 200)
        XCTAssertTrue(glass.contains(text))
        XCTAssertGreaterThan(glass.width, text.width)
    }

    // MARK: The passage picker

    // The system's Back drew «Livros» a second time once the push had settled
    // (iOS 27): the label blinked out and faded back in. The chapters have their
    // own, drawn once, and the swipe back still works.
    func testThePickersChaptersHaveTheirOwnBackToTheBooks() throws {
        let data = PassagePickerData(call([
            "currentBookId": "gn", "currentChapter": 1,
            "sections": [["title": "Antigo Testamento", "groups": [["books": [[
                "id": "gn", "label": "Génesis", "name": "Livro do Génesis", "abbreviation": "Gn",
                "chapters": [["number": 1, "label": "1"], ["number": 2, "label": "2"]],
            ]]]]]],
        ]))
        let picker = PassagePickerController(data: data, onSelect: { _, _ in })
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 402, height: 874))
        window.rootViewController = picker
        window.isHidden = false
        picker.loadViewIfNeeded()

        let chapters = try XCTUnwrap(picker.topViewController)
        chapters.loadViewIfNeeded()
        XCTAssertEqual(picker.viewControllers.count, 2)
        XCTAssertTrue(chapters.navigationItem.hidesBackButton)
        let back = try XCTUnwrap(chapters.navigationItem.leftBarButtonItem?.customView as? UIButton)
        XCTAssertEqual(back.configuration?.title, "Livros")
        let swipe = try XCTUnwrap(picker.interactivePopGestureRecognizer)
        XCTAssertTrue(swipe.delegate === picker)

        back.sendActions(for: .primaryActionTriggered)
        RunLoop.main.run(until: Date().addingTimeInterval(0.6))
        XCTAssertEqual(picker.viewControllers.count, 1)
        // Nothing to go back to from the books.
        XCTAssertFalse(picker.gestureRecognizerShouldBegin(swipe))
    }

    // Nor while a book's chapters are still sliding in: a pop begun over the
    // running push can break the stack.
    func testThePickersSwipeBackWaitsForAPushToEnd() throws {
        // On a book with no chapters, the picker opens on the books alone.
        let data = PassagePickerData(call([
            "currentBookId": "x", "currentChapter": 0,
            "sections": [["title": "Antigo Testamento", "groups": [["books": [[
                "id": "gn", "label": "Génesis", "name": "Livro do Génesis", "abbreviation": "Gn",
                "chapters": [["number": 1, "label": "1"]],
            ]]]]]],
        ]))
        let picker = PassagePickerController(data: data, onSelect: { _, _ in })
        // In the host's scene, so the push really animates.
        let scene = try XCTUnwrap(UIApplication.shared.connectedScenes.first as? UIWindowScene)
        let window = UIWindow(windowScene: scene)
        window.rootViewController = picker
        window.makeKeyAndVisible()
        defer { window.isHidden = true }
        RunLoop.main.run(until: Date().addingTimeInterval(0.3))
        let swipe = RightwardPan()

        picker.pushViewController(UIViewController(), animated: true)
        RunLoop.main.run(until: Date().addingTimeInterval(0.05))
        XCTAssertEqual(picker.viewControllers.count, 2)
        XCTAssertNotNil(picker.transitionCoordinator)
        XCTAssertFalse(picker.gestureRecognizerShouldBegin(swipe))

        RunLoop.main.run(until: Date().addingTimeInterval(0.6))
        XCTAssertNil(picker.transitionCoordinator)
        XCTAssertTrue(picker.gestureRecognizerShouldBegin(swipe))
    }

    /// A drag to the right, as the swipe back would see it.
    private final class RightwardPan: UIPanGestureRecognizer {
        override func velocity(in view: UIView?) -> CGPoint { CGPoint(x: 500, y: 0) }
    }

    // MARK: The sheets

    private func subviews<T: UIView>(of view: UIView, _ type: T.Type) -> [T] {
        ((view as? T).map { [$0] } ?? []) + view.subviews.flatMap { subviews(of: $0, type) }
    }

    // The notes stayed justified, with rivers on a phone, beside the reader's
    // ragged-right verses: they are set as the reader's text is now.
    func testSetsTheNotesAsTheReadersText() throws {
        func style(_ options: [String: Any]) throws -> NSParagraphStyle {
            var payload: [String: Any] = [
                "title": "João 3,16",
                "notes": [["reference": "16.", "parts": [["text": "Ver Gn 22,1-14."]]]],
            ]
            payload.merge(options) { $1 }
            let sheet = FootnotesController(state: FootnotesSheetState(call(payload)), onLink: { _ in }, onClose: {})
            sheet.loadViewIfNeeded()
            let text = try XCTUnwrap(subviews(of: sheet.view, UITextView.self).first)
            let style = text.attributedText.attribute(.paragraphStyle, at: 0, effectiveRange: nil) as? NSParagraphStyle
            return try XCTUnwrap(style)
        }
        func alignment(_ options: [String: Any]) throws -> NSTextAlignment { try style(options).alignment }
        XCTAssertEqual(try alignment(["raggedText": true]), .natural)
        XCTAssertEqual(try alignment(["raggedText": false, "fontScale": 2.2]), .justified)
        // A web app that doesn't say: by the size, as before.
        XCTAssertEqual(try alignment([:]), .justified)
        XCTAssertEqual(try alignment(["fontScale": 2.2]), .natural)
        // Hyphenated as the reader's text: a ragged default still is, the
        // reader's own ragged choice isn't, and so is a web app that doesn't say.
        XCTAssertGreaterThan(try style(["raggedText": true, "hyphenate": true]).hyphenationFactor, 0)
        XCTAssertEqual(try style(["raggedText": true, "hyphenate": false]).hyphenationFactor, 0)
        XCTAssertGreaterThan(try style(["fontScale": 2.2]).hyphenationFactor, 0)
    }

    // A wide item («Génesis 1», 160 pt) still covered the new middle where
    // the bar had left it: taken as laid out, the ring stayed 38 pt off.
    func testRingsAWideButtonWhereTheBarMovesItAfterATurn() {
        let bar = LateBar(itemWidth: 160)
        let ringed = RingedBarButton(bar)
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 678, height: 678))
        window.addSubview(ringed)
        window.isHidden = false
        for width in [CGFloat(454), 530] {
            ringed.frame = CGRect(x: 0, y: 0, width: width, height: 88)
            ringed.layoutIfNeeded()
            RunLoop.main.run(until: Date().addingTimeInterval(0.3))
        }

        let rings = ringed.subviews.filter { $0 !== bar }.map(\.frame)
        XCTAssertFalse(rings.isEmpty)
        for ring in rings {
            XCTAssertEqual(ring.midX, 265, accuracy: 1, "the ring stayed where the item was")
        }
    }

    // The folded iPhone Duo turned sideways puts Close down the left side,
    // inside the sheet's safe area: it covered the note's «16.» and «Ver».
    func testFootnotesStayClearOfASideSafeArea() throws {
        let state = FootnotesSheetState(call([
            "title": "João 3,16",
            "notes": [["reference": "16.", "parts": [["text": "Ver Gn 22,1-14."]]]],
        ]))
        let sheet = FootnotesController(state: state, onLink: { _ in }, onClose: {})
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 678, height: 466))
        window.rootViewController = sheet
        window.isHidden = false
        sheet.additionalSafeAreaInsets = UIEdgeInsets(top: 0, left: 84, bottom: 0, right: 0)
        sheet.view.layoutIfNeeded()

        let text = try XCTUnwrap(subviews(of: sheet.view, UITextView.self).first)
        XCTAssertGreaterThanOrEqual(text.convert(text.bounds, to: sheet.view).minX, 84 - 0.5)
    }

    // On the folded iPhone Duo the status bar and Close run down the right
    // side, inside the safe area: the ringed copy and the intro ran under them.
    func testOnboardingPagesStayClearOfASideSafeArea() throws {
        let steps = OnboardingStepData.parse(call(["steps": [
            ["id": "welcome", "title": "Bem-vindo", "intro": "…", "symbol": "book",
             "logo": false, "features": []],
        ]]))
        let sheet = OnboardingController(steps: steps, onFinish: { _, _ in })
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 466, height: 678))
        window.rootViewController = sheet
        window.isHidden = false
        sheet.additionalSafeAreaInsets = UIEdgeInsets(top: 0, left: 0, bottom: 0, right: 84)
        sheet.view.layoutIfNeeded()

        let pager = try XCTUnwrap(subviews(of: sheet.view, UIScrollView.self).first { $0.isPagingEnabled })
        let frame = pager.convert(pager.bounds, to: sheet.view)
        XCTAssertLessThanOrEqual(frame.maxX, 466 - 84 + 0.5)
    }

    // At the largest text size a title's word was broken without a hyphen
    // ("Escolh/er"), and "Começar a ler", wrapped, sat to the left.
    @available(iOS 17.0, *)
    func testOnboardingAtTheLargestTextSize() throws {
        let steps = OnboardingStepData.parse(call(["steps": [
            ["id": "passage", "title": "Escolher um livro", "intro": "…", "symbol": "book",
             "logo": false, "features": []],
        ]]))
        let sheet = OnboardingController(steps: steps, onFinish: { _, _ in })
        sheet.traitOverrides.preferredContentSizeCategory = .accessibilityExtraExtraExtraLarge
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 402, height: 874))
        window.rootViewController = sheet
        window.isHidden = false
        sheet.view.layoutIfNeeded()

        let title = try XCTUnwrap(subviews(of: sheet.view, UILabel.self).first { $0.accessibilityTraits.contains(.header) })
        XCTAssertEqual(title.text, "Escolher um livro")
        let paragraph = try XCTUnwrap(title.attributedText?.attribute(.paragraphStyle, at: 0, effectiveRange: nil) as? NSParagraphStyle)
        XCTAssertGreaterThan(paragraph.hyphenationFactor, 0)
        XCTAssertEqual(paragraph.alignment, .center)

        let start = try XCTUnwrap(subviews(of: sheet.view, UIButton.self).first { $0.configuration?.title == "Começar a ler" })
        let label = try XCTUnwrap(start.titleLabel?.attributedText)
        let alignment = (label.attribute(.paragraphStyle, at: 0, effectiveRange: nil) as? NSParagraphStyle)?.alignment
        XCTAssertEqual(alignment, .center)
    }

    @available(iOS 16.0, *)
    func testRemovingARibbonEndsEditing() throws {
        let ribbons: [[String: Any]] = [
            ["color": "red", "name": "Vermelho", "label": "Mt 5", "current": false],
            ["color": "blue", "name": "Azul", "label": "Mt 6", "current": false],
        ]
        var sent: [String] = []
        let sheet = BookmarksController(
            state: BookmarksSheetState(call(["currentLabel": "Mateus 7", "ribbons": ribbons])),
            send: { action, color in sent.append("\(action) \(color)") }, onClose: {})
        sheet.loadViewIfNeeded()
        let removable = { [self] in subviews(of: sheet.view, UIButton.self).filter { $0.accessibilityHint == "Retira o marcador" } }

        sheet.navigationItem.leftBarButtonItem?.primaryAction?.performWithSender(nil, target: nil)
        XCTAssertEqual(removable().count, 2)
        removable()[0].sendActions(for: .primaryActionTriggered)

        XCTAssertEqual(sent, ["bookmark-remove red"])
        XCTAssertEqual(removable().count, 0)
        XCTAssertEqual(sheet.navigationItem.leftBarButtonItem?.title, "Editar")
    }

    @available(iOS 16.0, *)
    func testReportGivesUpOnlyOnTheSendStillWaiting() throws {
        let topics: [[String: Any]] = [["value": "typo", "label": "Erro"]]
        let report = ReportController(
            state: ReportSheetState(call(["topics": topics, "maxLength": 500])), onSubmit: { _, _ in }, onClose: {})
        report.sendTimeout = 0.2
        report.loadViewIfNeeded()
        report.tableView(report.tableView, didSelectRowAt: IndexPath(row: 0, section: 0))
        let cell = report.tableView(report.tableView, cellForRowAt: IndexPath(row: 0, section: 1))
        try XCTUnwrap(subviews(of: cell.contentView, UITextView.self).first).text = "Falta uma palavra"
        let send = try XCTUnwrap(report.navigationItem.rightBarButtonItem)
        let waiting = { report.navigationItem.leftBarButtonItem?.isEnabled == false }
        let wait = { RunLoop.main.run(until: Date().addingTimeInterval($0)) }

        send.primaryAction?.performWithSender(nil, target: nil)
        XCTAssertTrue(waiting())
        report.finish(sent: false, message: "")
        XCTAssertFalse(waiting())

        // No timing window to hit on a slow runner: this send's limit is far
        // off, so only the first send's timer could end it.
        report.sendTimeout = 600
        send.primaryAction?.performWithSender(nil, target: nil)
        wait(1)
        XCTAssertTrue(waiting())
        report.finish(sent: false, message: "")

        report.sendTimeout = 0.2
        send.primaryAction?.performWithSender(nil, target: nil)
        let deadline = Date().addingTimeInterval(20)
        while waiting() && Date() < deadline { wait(0.05) }
        XCTAssertFalse(waiting())
    }
}
