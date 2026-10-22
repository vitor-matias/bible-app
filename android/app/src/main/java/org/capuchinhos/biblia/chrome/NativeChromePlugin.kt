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
        chrome = ChromeController(activity, bridge.webView, ::send, ::sendInsets)
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

    /** The share target chosen in the system's share sheet, if one was. */
    private var shareTarget: ComponentName? = null

    private val shareChosen = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            shareTarget = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                intent.getParcelableExtra(Intent.EXTRA_CHOSEN_COMPONENT, ComponentName::class.java)
            } else {
                @Suppress("DEPRECATION")
                intent.getParcelableExtra(Intent.EXTRA_CHOSEN_COMPONENT)
            }
        }
    }

    /**
     * The system share sheet with the passage's text and link, the page's
     * title over its preview. Resolves once the sheet closes, with whether
     * an app was chosen to share with.
     */
    @PluginMethod
    fun share(call: PluginCall) {
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
        shareTarget = null
        ContextCompat.registerReceiver(context, shareChosen, IntentFilter(SHARE_CHOSEN), ContextCompat.RECEIVER_NOT_EXPORTED)
        startActivityForResult(call, Intent.createChooser(send, null, chosen.intentSender), "shareClosed")
    }

    @ActivityCallback
    private fun shareClosed(call: PluginCall?, @Suppress("UNUSED_PARAMETER") result: ActivityResult) {
        try {
            context.unregisterReceiver(shareChosen)
        } catch (_: IllegalArgumentException) {
            // Not registered: the activity was recreated while the sheet showed.
        }
        call?.resolve(JSObject().put("completed", shareTarget != null))
        shareTarget = null
    }

    private fun send(action: String, extra: JSObject) {
        notifyListeners("action", extra.put("id", action))
    }

    private fun sendInsets(insets: ChromeInsets) {
        notifyListeners("insets", insets.toJSObject())
    }

    private fun presented(presented: Boolean) = JSObject().put("presented", presented)

    private companion object {
        const val SHARE_CHOSEN = "org.capuchinhos.biblia.SHARE_CHOSEN"
    }
}
