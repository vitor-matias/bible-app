import Foundation
import MetricKit

/// Sends the crash reports iOS collects for the app (MetricKit, delivered on
/// a later launch) to Umami as "crash" events, so a crash on any device,
/// App Review's included, comes with the crashed thread's call stack.
///
/// Umami keeps at most 500 characters per event property, so each frame is
/// its own property ("frame00", "frame01", …), as "binary UUID +0xoffset":
/// `atos -o App.dSYM/Contents/Resources/DWARF/App -l 0x100000000 <0x100000000 + offset>`
/// names it. The other threads are left out.
final class CrashReporter: NSObject, MXMetricManagerSubscriber {
    static let shared = CrashReporter()

    /// Where web-side events go too: index.html's Umami script tag.
    private static let endpoint = URL(string: "https://umami.dojo.pt/api/send")
    private static let website = "5f2a57be-86a2-4608-8fc5-667a9c24689c"
    /// Enough to see where it crashed; a stack overflow has thousands.
    private static let maxFrames = 60

    func start() {
        MXMetricManager.shared.add(self)
    }

    func didReceive(_ payloads: [MXDiagnosticPayload]) {
        let crashes = payloads.flatMap { $0.crashDiagnostics ?? [] }
        guard !crashes.isEmpty else { return }
        DispatchQueue.global(qos: .utility).async {
            crashes.forEach(Self.send)
        }
    }

    private static func send(_ crash: MXCrashDiagnostic) {
        guard let endpoint else { return }
        var data: [String: Any] = [
            "platform": "ios",
            "version": crash.applicationVersion,
            "build": crash.metaData.applicationBuildVersion,
            "os": crash.metaData.osVersion,
            "device": crash.metaData.deviceType,
        ]
        data["exception_type"] = crash.exceptionType
        data["exception_code"] = crash.exceptionCode
        data["signal"] = crash.signal
        data["termination_reason"] = crash.terminationReason
        if #available(iOS 17.0, *) {
            // The name only: the message may carry text the reader saw.
            data["objc_exception"] = crash.exceptionReason?.exceptionName
        }
        for (index, frame) in crashedThreadFrames(crash.callStackTree).enumerated() {
            data[String(format: "frame%02d", index)] = frame
        }

        let body: [String: Any] = [
            "type": "event",
            "payload": [
                "website": website,
                "hostname": "ios-app",
                "tag": "ios",
                "url": "/",
                "language": Locale.preferredLanguages.first ?? "",
                "name": "crash",
                "data": data,
            ],
        ]
        guard let json = try? JSONSerialization.data(withJSONObject: body) else { return }
        var request = URLRequest(url: endpoint, timeoutInterval: 30)
        request.httpMethod = "POST"
        request.httpBody = json
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        // The web view's form, so Umami files it under iOS like the app's
        // other events instead of as a bot (CFNetwork's default).
        let os = ProcessInfo.processInfo.operatingSystemVersion
        request.setValue(
            "Mozilla/5.0 (iPhone; CPU iPhone OS \(os.majorVersion)_\(os.minorVersion) like Mac OS X) "
                + "AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
            forHTTPHeaderField: "User-Agent"
        )
        // shortcut: a report that fails to send is lost (MetricKit delivers it
        // once); persist and retry if crashes from offline devices go missing.
        URLSession.shared.dataTask(with: request).resume()
    }

    /// The crashed thread's frames, innermost first. A call stack tree is
    /// rooted at the thread's entry point and each sub-frame is a callee, so a
    /// crash's tree is one chain ending at the crash site: reverse it before
    /// capping, or a deep stack loses exactly the frames that matter.
    private static func crashedThreadFrames(_ tree: MXCallStackTree) -> [String] {
        guard
            let root = try? JSONSerialization.jsonObject(with: tree.jsonRepresentation()) as? [String: Any],
            let stacks = root["callStacks"] as? [[String: Any]],
            let stack = stacks.first(where: { $0["threadAttributed"] as? Bool == true }) ?? stacks.first
        else { return [] }
        var frames: [String] = []
        var frame = (stack["callStackRootFrames"] as? [[String: Any]])?.first
        while let current = frame {
            let name = current["binaryName"] as? String ?? "?"
            let uuid = current["binaryUUID"] as? String ?? "?"
            let offset = current["offsetIntoBinaryTextSegment"] as? Int ?? 0
            frames.append("\(name) \(uuid) +0x\(String(offset, radix: 16))")
            frame = (current["subFrames"] as? [[String: Any]])?.first
        }
        return Array(frames.reversed().prefix(maxFrames))
    }
}
