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
}
