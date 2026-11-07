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
}
