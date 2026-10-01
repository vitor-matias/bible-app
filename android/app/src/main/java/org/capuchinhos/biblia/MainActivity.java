package org.capuchinhos.biblia;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    /** Must match appConfig.domain, which AppComponent routes app URLs for. */
    private static final String SITE_HOST = "biblia.capuchinhos.org";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Only a fresh launch: a recreated activity would replay the share.
        if (savedInstanceState == null) {
            setIntent(toShareTargetIntent(getIntent()));
        }
        super.onCreate(savedInstanceState);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(toShareTargetIntent(intent));
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
