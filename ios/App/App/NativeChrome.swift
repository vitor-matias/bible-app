import UIKit
import Capacitor

// The iOS app draws its bars natively so they get the system material: Liquid
// Glass on iOS 26 and later, the classic translucent bars before that. The web
// app stays the source of truth: it sends what the bars show through
// `NativeChrome.setState` (native-chrome.service.ts) and handles the taps,
// which arrive as `action` events. ChromeViewController lays the bars out.

final class MainViewController: CAPBridgeViewController {
    let chromePlugin = NativeChromePlugin()

    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(chromePlugin)
    }
}

/// What the web app wants the bars to show. Mirrors `NativeChromeState` in
/// native-chrome.service.ts.
struct ChromeState: Equatable {
    enum Mode: String {
        /// No native bars (e.g. the reader before its books load).
        case none
        /// Top: the More menu. Bottom: chapter arrows, passage picker, search.
        case reader
        /// Top: Back. Bottom: the search field, above the keyboard.
        case search
        /// A plain page (e.g. the book index). Top: Back, its title, search.
        case page
    }

    var mode = Mode.none
    /// A web dialog is open: the bars ignore taps and dim, as behind a modal.
    var inert = false
    /// Hidden while reading, to leave the page to the text.
    var collapsed = false
    var themeMode = "system"

    // Reader
    var passageLabel = ""
    var passageAccessibilityLabel = ""
    var chapterNavigation = false
    var canGoPrevious = false
    var canGoNext = false
    var search = false
    var viewMode: String?
    var autoScrollVisible = false
    var autoScrollAvailable = false
    var canShare = false
    var canReport = false

    var autoScroll: AutoScrollState?

    // Search
    var query = ""

    // Page
    var title = ""

    init() {}

    init(_ call: CAPPluginCall) {
        mode = Mode(rawValue: call.getString("mode", "none")) ?? .none
        inert = call.getBool("inert", false)
        collapsed = call.getBool("collapsed", false)
        themeMode = call.getString("themeMode", "system")
        passageLabel = call.getString("passageLabel", "")
        passageAccessibilityLabel = call.getString("passageAccessibilityLabel", passageLabel)
        chapterNavigation = call.getBool("chapterNavigation", false)
        canGoPrevious = call.getBool("canGoPrevious", false)
        canGoNext = call.getBool("canGoNext", false)
        search = call.getBool("search", false)
        viewMode = call.getString("viewMode")
        autoScrollVisible = call.getBool("autoScrollVisible", false)
        autoScrollAvailable = call.getBool("autoScrollAvailable", false)
        canShare = call.getBool("canShare", false)
        canReport = call.getBool("canReport", false)
        query = call.getString("query", "")
        title = call.getString("title", "")
        autoScroll = call.getObject("autoScroll").map(AutoScrollState.init)
    }
}

/// Auto-scroll's controls, which take over the reader's toolbar while shown.
struct AutoScrollState: Equatable {
    var playing: Bool
    var speedLabel: String
    var canSlower: Bool
    var canFaster: Bool

    init(_ object: JSObject) {
        playing = object["playing"] as? Bool ?? false
        speedLabel = object["speedLabel"] as? String ?? ""
        canSlower = object["canSlower"] as? Bool ?? false
        canFaster = object["canFaster"] as? Bool ?? false
    }
}

@objc(NativeChromePlugin)
public class NativeChromePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NativeChromePlugin"
    public let jsName = "NativeChrome"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setState", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "showPicker", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "showOnboarding", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "showBookmarks", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "updateBookmarks", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "showFootnotes", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "showToast", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "showReport", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "finishReport", returnType: CAPPluginReturnPromise),
    ]

    weak var chrome: ChromeViewController?

    /// Applies the state and resolves with the space the bars cover, which the
    /// page pads its scrolling content by.
    @objc func setState(_ call: CAPPluginCall) {
        let state = ChromeState(call)
        DispatchQueue.main.async {
            guard let chrome = self.chrome else {
                call.reject("The native chrome is not available")
                return
            }
            chrome.apply(state)
            call.resolve(chrome.insets.dictionary)
        }
    }

    @objc func showPicker(_ call: CAPPluginCall) {
        let data = PassagePickerData(call)
        DispatchQueue.main.async {
            self.chrome?.presentPicker(data)
            call.resolve()
        }
    }

    /// The sheets resolve with whether they were presented: not over another
    /// sheet, and then no closing event follows.
    @objc func showBookmarks(_ call: CAPPluginCall) {
        let state = BookmarksSheetState(call)
        DispatchQueue.main.async {
            let presented = self.chrome?.presentBookmarks(state) ?? false
            call.resolve(["presented": presented])
        }
    }

    @objc func showToast(_ call: CAPPluginCall) {
        let message = call.getString("message", "")
        let button = call.getBool("button", false)
        let symbol = call.getString("symbol")
        DispatchQueue.main.async {
            if !message.isEmpty {
                self.chrome?.showToast(message, button: button, symbol: symbol)
            }
            call.resolve()
        }
    }

    @objc func showReport(_ call: CAPPluginCall) {
        let state = ReportSheetState(call)
        DispatchQueue.main.async {
            let presented = self.chrome?.presentReport(state) ?? false
            call.resolve(["presented": presented])
        }
    }

    /// The web app's answer to report-submit: sent, or the error to show.
    @objc func finishReport(_ call: CAPPluginCall) {
        let sent = call.getBool("sent", false)
        let message = call.getString("message", "")
        DispatchQueue.main.async {
            self.chrome?.reportSheet?.finish(sent: sent, message: message)
            call.resolve()
        }
    }

    @objc func showFootnotes(_ call: CAPPluginCall) {
        let state = FootnotesSheetState(call)
        DispatchQueue.main.async {
            let presented = self.chrome?.presentFootnotes(state) ?? false
            call.resolve(["presented": presented])
        }
    }

    @objc func updateBookmarks(_ call: CAPPluginCall) {
        let state = BookmarksSheetState(call)
        DispatchQueue.main.async {
            self.chrome?.bookmarksSheet?.update(state)
            call.resolve()
        }
    }

    /// Resolves once the sheet is dismissed: completed, or skipped at a step.
    @objc func showOnboarding(_ call: CAPPluginCall) {
        let steps = OnboardingStepData.parse(call)
        DispatchQueue.main.async {
            guard let chrome = self.chrome, !steps.isEmpty else {
                call.resolve(["completed": false, "lastStep": ""])
                return
            }
            chrome.presentOnboarding(steps) { completed, lastStep in
                call.resolve(["completed": completed, "lastStep": lastStep])
            }
        }
    }

    func send(_ action: String, _ extra: [String: Any] = [:]) {
        notifyListeners("action", data: extra.merging(["id": action]) { _, new in new })
    }

    func sendInsets(_ insets: ChromeInsets) {
        notifyListeners("insets", data: insets.dictionary)
    }
}

/// The space the bars cover at the top and bottom of the page, in CSS pixels.
struct ChromeInsets: Equatable {
    var top: CGFloat = 0
    var bottom: CGFloat = 0

    var dictionary: [String: Any] { ["top": top, "bottom": bottom] }
}
