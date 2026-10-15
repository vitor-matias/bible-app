package org.capuchinhos.biblia;

import android.content.Intent;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    /** Must match appConfig.domain, which AppComponent routes app URLs for. */
    private static final String SITE_HOST = "biblia.capuchinhos.org";

    /**
     * The first WebView that reports the system bars as safe areas, from which
     * Capacitor's SystemBars lets the page draw under them
     * (SystemBars.WEBVIEW_VERSION_WITH_SAFE_AREA_FIX).
     */
    private static final int EDGE_TO_EDGE_WEBVIEW_VERSION = 140;

    /** True while a recreated activity runs super.onCreate. */
    private boolean restoring;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Only a fresh launch: a recreated activity would replay the share.
        restoring = savedInstanceState != null;
        if (!restoring) {
            setIntent(toShareTargetIntent(getIntent()));
        }
        super.onCreate(savedInstanceState);
        restoring = false;
    }

    @Override
    protected void onNewIntent(Intent intent) {
        // BridgeActivity.load() passes getIntent() here from inside onCreate.
        // When restoring, that is the original, already handled share, so it
        // goes through unconverted and the App plugin ignores it.
        super.onNewIntent(restoring ? intent : toShareTargetIntent(intent));
    }

    @Override
    protected void load() {
        // Older WebViews (all of Android 7 to 9's) get the page laid out
        // between the system bars, over the window background, which
        // SystemBars repaints from the theme on every style change: white
        // under the status bar's light icons. Brown before the plugins load.
        if (webViewMajorVersion() < EDGE_TO_EDGE_WEBVIEW_VERSION) {
            getTheme().applyStyle(R.style.ThemeOverlay_App_HeaderWindow, true);
        }
        super.load();
    }

    /** The system WebView's major version, or 0 if unknown. */
    private static int webViewMajorVersion() {
        // Android 7 can't tell, and its last WebView was 119.
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return 0;
        }
        PackageInfo webView = WebView.getCurrentWebViewPackage();
        if (webView == null || webView.versionName == null) {
            return 0;
        }
        try {
            return Integer.parseInt(webView.versionName.split("\\.")[0]);
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    /**
     * Rewrites a text share (ACTION_SEND) into the URL the PWA receives from
     * its manifest share_target, https://SITE_HOST/?text=…&title=…, as a VIEW
     * intent. Capacitor's App plugin emits VIEW intents as `appUrlOpen` (and
     * holds a launch one until a listener exists), so the web code handles
     * shares the same way on every platform. Other intents pass through.
     */
    static Intent toShareTargetIntent(Intent intent) {
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) {
            return intent;
        }
        CharSequence text = intent.getCharSequenceExtra(Intent.EXTRA_TEXT);
        CharSequence title = intent.getCharSequenceExtra(Intent.EXTRA_SUBJECT);
        if (text == null && title == null) {
            return intent;
        }

        Uri.Builder uri = new Uri.Builder().scheme("https").authority(SITE_HOST).path("/");
        if (text != null) {
            uri.appendQueryParameter("text", text.toString());
        }
        if (title != null) {
            uri.appendQueryParameter("title", title.toString());
        }
        return new Intent(Intent.ACTION_VIEW, uri.build());
    }
}
