import UIKit
import Capacitor
import LinkPresentation

/// A passage to share, from the web app (header.component.ts).
struct ShareSheetState {
    /// Mail's subject.
    let subject: String
    let text: String
    let url: URL?
    /// Heads the link's preview, e.g. "Mateus 5 | Bíblia Sagrada".
    let linkTitle: String

    init(_ call: CAPPluginCall) {
        subject = call.getString("title", "")
        text = call.getString("text", "")
        url = call.getString("url").flatMap(URL.init(string:))
        linkTitle = call.getString("linkTitle", subject)
    }

    var activityItems: [Any] {
        var items: [Any] = []
        if !text.isEmpty { items.append(text) }
        if let url { items.append(SharedLink(url: url, title: linkTitle, subject: subject)) }
        return items
    }
}

/// The passage's link, previewed at the top of the share sheet with the app's
/// icon. Given a bare URL, iOS fetches the preview from the website, whose
/// icon carries the installed website's WEB sash.
final class SharedLink: NSObject, UIActivityItemSource {
    let url: URL
    let subject: String
    let metadata = LPLinkMetadata()

    init(url: URL, title: String, subject: String) {
        self.url = url
        self.subject = subject
        metadata.originalURL = url
        metadata.url = url
        metadata.title = title
        // The app's icon, as the onboarding shows it.
        if let icon = UIImage(named: "OnboardingLogo") {
            metadata.iconProvider = NSItemProvider(object: icon)
        }
    }

    func activityViewControllerPlaceholderItem(_ controller: UIActivityViewController) -> Any {
        url
    }

    func activityViewController(_ controller: UIActivityViewController,
                                itemForActivityType activityType: UIActivity.ActivityType?) -> Any? {
        url
    }

    func activityViewController(_ controller: UIActivityViewController,
                                subjectForActivityType activityType: UIActivity.ActivityType?) -> String {
        subject
    }

    func activityViewControllerLinkMetadata(_ controller: UIActivityViewController) -> LPLinkMetadata? {
        metadata
    }
}
