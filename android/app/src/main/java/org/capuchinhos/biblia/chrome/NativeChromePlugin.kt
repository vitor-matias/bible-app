package org.capuchinhos.biblia.chrome

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.res.Configuration
import android.os.Build
import androidx.activity.result.ActivityResult
import androidx.core.content.ContextCompat
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * The Android app draws its bars and sheets natively, in Material 3; the iOS
 * app draws its own with UIKit (ios/App/App/NativeChrome.swift), behind the
 * same contract (native-chrome.service.ts). The web app stays
 * the source of truth: it sends what the bars show through `setState`
 * (native-chrome.service.ts) and handles the taps, which arrive as `action`
 * events. [ChromeController] draws them over the web view.
 */
@CapacitorPlugin(name = "NativeChrome")
class NativeChromePlugin : Plugin() {
    private lateinit var chrome: ChromeController

    override fun load() {
        chrome = ChromeController(activity, bridge.webView, ::send, ::sendInsets, ::sendPalette)
    }

    override fun handleOnConfigurationChanged(newConfig: Configuration) {
        super.handleOnConfigurationChanged(newConfig)
        chrome.onConfigurationChanged()
    }

    override fun handleOnDestroy() {
        chrome.destroy()
        super.handleOnDestroy()
    }

    /** Applies the state and resolves with the space the bars cover. */
    @PluginMethod
    fun setState(call: PluginCall) {
        val state = ChromeState.from(call)
        activity.runOnUiThread {
            chrome.apply(state)
            call.resolve(chrome.insets.toJSObject())
        }
    }

    /** How far through the chapter the reader is, 0 to 1; null hides the line. */
    @PluginMethod
    fun setProgress(call: PluginCall) {
        val value = if (call.data.isNull("value")) null else call.data.optDouble("value", Double.NaN)
        activity.runOnUiThread {
            chrome.showProgress(value?.takeUnless { it.isNaN() }?.toFloat())
            call.resolve()
        }
    }

    @PluginMethod
    fun showPicker(call: PluginCall) {
        val data = PassagePickerData.from(call)
        activity.runOnUiThread {
            chrome.present(Sheet.Picker(data))
            call.resolve()
        }
    }

    /**
     * The sheets resolve with whether they came up: not over another one. One
     * on its way out is waited for, so its closing event comes first.
     */
    @PluginMethod
    fun showBookmarks(call: PluginCall) {
        val state = BookmarksSheetState.from(call)
        activity.runOnUiThread { chrome.present(Sheet.Bookmarks(state)) { call.resolve(presented(it)) } }
    }

    @PluginMethod
    fun updateBookmarks(call: PluginCall) {
        val state = BookmarksSheetState.from(call)
        activity.runOnUiThread {
            chrome.updateBookmarks(state)
            call.resolve()
        }
    }

    @PluginMethod
    fun showFootnotes(call: PluginCall) {
        val state = FootnotesSheetState.from(call)
        activity.runOnUiThread { chrome.present(Sheet.Footnotes(state)) { call.resolve(presented(it)) } }
    }

    @PluginMethod
    fun showToast(call: PluginCall) {
        val message = call.getString("message", "")!!
        val button = call.getBoolean("button", false)!!
        activity.runOnUiThread {
            if (message.isNotEmpty()) chrome.showToast(message, button)
            call.resolve()
        }
    }

    /** Takes the snackbar down, if one is showing. */
    @PluginMethod
    fun hideToast(call: PluginCall) {
        activity.runOnUiThread {
            chrome.hideToast()
            call.resolve()
        }
    }

    @PluginMethod
    fun showReport(call: PluginCall) {
        val state = ReportSheetState.from(call)
        activity.runOnUiThread { chrome.present(Sheet.Report(state)) { call.resolve(presented(it)) } }
    }

    /** The web app's answer to report-submit: sent, or the error to show. */
    @PluginMethod
    fun finishReport(call: PluginCall) {
        val sent = call.getBoolean("sent", false)!!
        val message = call.getString("message", "")!!
        activity.runOnUiThread {
            chrome.finishReport(sent, message)
            call.resolve()
        }
    }

    /**
     * Resolves once the onboarding is closed: completed, or skipped at a step.
     * Resolves at once with `presented: false` when it didn't come up, which
     * the web app must not take for the onboarding seen.
     */
    @PluginMethod
    fun showOnboarding(call: PluginCall) {
        val steps = OnboardingStep.from(call)
        activity.runOnUiThread {
            val sheet = Sheet.Onboarding(steps) { completed, lastStep ->
                call.resolve(
                    JSObject().apply {
                        put("presented", true)
                        put("completed", completed)
                        put("lastStep", lastStep)
                    },
                )
            }
            if (steps.isEmpty()) {
                call.resolve(presented(false))
            } else {
                chrome.present(sheet) { shown -> if (!shown) call.resolve(presented(false)) }
            }
        }
    }

    private val shareSession = ShareSession()

    private val shareChosen = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            val target = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                intent.getParcelableExtra(Intent.EXTRA_CHOSEN_COMPONENT, ComponentName::class.java)
            } else {
                @Suppress("DEPRECATION")
                intent.getParcelableExtra(Intent.EXTRA_CHOSEN_COMPONENT)
            }
            if (target != null) shareSession.choose()
        }
    }

    /**
     * The system share sheet with the passage's text and link, the page's
     * title over its preview. Resolves once the sheet closes, with whether
     * an app was chosen to share with. Rejected while one is already open:
     * Capacitor answers every sheet's result with the latest call, so the
     * first call would never resolve.
     */
    @PluginMethod
    fun share(call: PluginCall) {
        if (!shareSession.begin()) {
            call.reject("The share sheet is already open")
            return
        }
        val text = listOfNotNull(call.getString("text"), call.getString("url"))
            .filter { it.isNotEmpty() }
            .joinToString("\n")
        val send = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_TEXT, text)
            putExtra(Intent.EXTRA_SUBJECT, call.getString("title"))
            putExtra(Intent.EXTRA_TITLE, call.getString("linkTitle"))
        }
        val chosen = PendingIntent.getBroadcast(
            context,
            0,
            Intent(SHARE_CHOSEN).setPackage(context.packageName),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE,
        )
        try {
            ContextCompat.registerReceiver(context, shareChosen, IntentFilter(SHARE_CHOSEN), ContextCompat.RECEIVER_NOT_EXPORTED)
            startActivityForResult(call, Intent.createChooser(send, null, chosen.intentSender), "shareClosed")
        } catch (e: RuntimeException) {
            // No sheet came up, so no result will close this one.
            stopListeningForShare()
            shareSession.end()
            call.reject(e.message, e)
        }
    }

    @ActivityCallback
    private fun shareClosed(call: PluginCall?, @Suppress("UNUSED_PARAMETER") result: ActivityResult) {
        stopListeningForShare()
        val completed = shareSession.end()
        call?.resolve(JSObject().put("completed", completed))
    }

    private fun stopListeningForShare() {
        try {
            context.unregisterReceiver(shareChosen)
        } catch (_: IllegalArgumentException) {
            // Not registered: the activity was recreated while the sheet showed.
        }
    }

    private fun send(action: String, extra: JSObject) {
        notifyListeners("action", extra.put("id", action))
    }

    private fun sendInsets(insets: ChromeInsets) {
        notifyListeners("insets", insets.toJSObject())
    }

    /** Kept until the web app listens: the first comes as the overlay first draws. */
    private fun sendPalette(palette: JSObject) {
        notifyListeners("palette", palette, true)
    }

    private fun presented(presented: Boolean) = JSObject().put("presented", presented)

    private companion object {
        const val SHARE_CHOSEN = "org.capuchinhos.biblia.SHARE_CHOSEN"
    }
}

/** The one share sheet that may be open, and whether an app was chosen in it. */
internal class ShareSession {
    private var open = false
    private var chosen = false

    /** False when a sheet is already open. */
    @Synchronized
    fun begin(): Boolean {
        if (open) return false
        open = true
        chosen = false
        return true
    }

    @Synchronized
    fun choose() {
        if (open) chosen = true
    }

    /** Closes the sheet; whether an app was chosen in it. */
    @Synchronized
    fun end(): Boolean {
        val completed = chosen
        open = false
        chosen = false
        return completed
    }
}
