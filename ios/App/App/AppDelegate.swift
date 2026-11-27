import AVFoundation
import Capacitor
import UIKit
import UserNotifications

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // The +365 plays on with the phone locked or the app left: the web
        // view's <audio> keeps playing only in a playback session. The
        // category alone, not activated here: activating at launch would stop
        // the reader's own music on opening the Bible; the web view activates
        // it when +365 plays.
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio)
        // Before launch ends, or a tap that opens the app is never delivered.
        UNUserNotificationCenter.current().delegate = NotificationRelay.shared
        return true
    }

    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: "Default Configuration",
                                          sessionRole: connectingSceneSession.role)
        config.delegateClass = SceneDelegate.self
        return config
    }
}

/// A +365 reminder tapped with the app closed is delivered only to a delegate
/// set before launch ends. Capacitor's router comes with the bridge, made once
/// the scene connects: this holds the tap until then and hands it over, so
/// the web app opens the plan (mais365-reminder.service.ts).
final class NotificationRelay: NSObject, UNUserNotificationCenterDelegate {
    static let shared = NotificationRelay()
    private var held: [UNNotificationResponse] = []
    private weak var router: NotificationRouter?

    /// The bridge is up: its router is the delegate from here (it sets
    /// itself), and gets what came before it.
    func attach(_ router: NotificationRouter) {
        self.router = router
        let center = UNUserNotificationCenter.current()
        for response in held {
            router.userNotificationCenter(center, didReceive: response, withCompletionHandler: {})
        }
        held = []
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                didReceive response: UNNotificationResponse,
                                withCompletionHandler completionHandler: @escaping () -> Void) {
        guard let router else {
            held.append(response)
            completionHandler()
            return
        }
        router.userNotificationCenter(center, didReceive: response, withCompletionHandler: completionHandler)
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                willPresent notification: UNNotification,
                                withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        guard let router else {
            completionHandler([.banner, .list, .sound])
            return
        }
        router.userNotificationCenter(center, willPresent: notification, withCompletionHandler: completionHandler)
    }
}
