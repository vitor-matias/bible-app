package org.capuchinhos.biblia.crash

import android.app.ActivityManager
import android.app.ApplicationExitInfo
import android.content.Context
import android.os.Build
import androidx.annotation.RequiresApi
import org.capuchinhos.biblia.BuildConfig

/**
 * Crash reports for the Android app, the counterpart of the iOS shell's
 * CrashReporter: a Umami "crash" event, sent on the launch after the crash.
 *
 * Two sources, because neither is enough alone:
 *  - the uncaught exception handler, which saves a Java/Kotlin crash's stack
 *    (the system's record of that crash, REASON_CRASH, has no stack);
 *  - the system's record of the last run's death (API 30+): native crashes
 *    and ANRs, which no handler sees, and a plain crash the handler missed.
 *
 * There is no opt-out, as in the web app and the iOS shell. Off when
 * BuildConfig.CRASH_ENDPOINT is empty (debug builds, unless -PcrashEndpoint).
 */
object CrashReporting {
    private const val PREFS = "crash-reporting"
    private const val LAST_EXIT = "lastExit"

    /** Never throws and never waits: the sending is on a background thread. */
    fun start(context: Context) {
        try {
            val endpoint = BuildConfig.CRASH_ENDPOINT
            if (endpoint.isEmpty()) return
            val app = context.applicationContext
            val reporter = CrashReporter(
                dir = java.io.File(app.filesDir, "crash-reports"),
                endpoint = endpoint,
                app = AppInfo(
                    versionName = BuildConfig.VERSION_NAME,
                    versionCode = BuildConfig.VERSION_CODE.toLong(),
                    androidRelease = Build.VERSION.RELEASE,
                    sdk = Build.VERSION.SDK_INT,
                    device = "${Build.MANUFACTURER} ${Build.MODEL}",
                ),
            )
            reporter.installHandler()
            Thread({ sendLastRun(app, reporter) }, "crash-reporter").apply {
                isDaemon = true
                priority = Thread.MIN_PRIORITY
            }.start()
        } catch (_: Throwable) {
        }
    }

    private fun sendLastRun(context: Context, reporter: CrashReporter) {
        try {
            val savedAt = reporter.savedAt()
            reporter.sendSaved()
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) sendExits(context, reporter, savedAt)
        } catch (_: Throwable) {
        }
    }

    @RequiresApi(Build.VERSION_CODES.R)
    private fun sendExits(context: Context, reporter: CrashReporter, savedAt: List<Long>) {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        // Nothing from before this install or update: it ran other code.
        val installed = context.packageManager.getPackageInfo(context.packageName, 0).lastUpdateTime
        val after = maxOf(prefs.getLong(LAST_EXIT, 0), installed)
        val manager = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        val infos = manager.getHistoricalProcessExitReasons(context.packageName, 0, 0).mapNotNull { info ->
            val kind = when (info.reason) {
                ApplicationExitInfo.REASON_CRASH -> Exit.Kind.CRASH
                ApplicationExitInfo.REASON_CRASH_NATIVE -> Exit.Kind.NATIVE_CRASH
                ApplicationExitInfo.REASON_ANR -> Exit.Kind.ANR
                else -> null
            }
            kind?.let { Exit(info.timestamp, it, info.status) to info }
        }.toMap()
        for (exit in CrashReport.newExits(infos.keys.toList(), after)) {
            if (!CrashReport.isCoveredBySavedReport(exit, savedAt)) {
                val frames = if (exit.kind == Exit.Kind.ANR) anrFrames(infos.getValue(exit)) else emptyList()
                if (!reporter.send(CrashReport.fromExit(exit, frames, reporter.app))) return
            }
            prefs.edit().putLong(LAST_EXIT, exit.timestamp).apply()
        }
    }

    @RequiresApi(Build.VERSION_CODES.R)
    private fun anrFrames(info: ApplicationExitInfo): List<String> = try {
        info.traceInputStream?.bufferedReader()?.use { CrashReport.anrMainThreadFrames(it.readUpTo(MAX_TRACE_CHARS)) }
            ?: emptyList()
    } catch (_: Exception) {
        emptyList()
    }

    // The main thread is the dump's first thread, near the top.
    private const val MAX_TRACE_CHARS = 64 * 1024
}
