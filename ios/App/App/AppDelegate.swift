import AVFoundation
import UIKit

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
