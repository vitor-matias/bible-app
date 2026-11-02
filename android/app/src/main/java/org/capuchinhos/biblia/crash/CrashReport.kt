package org.capuchinhos.biblia.crash

import org.json.JSONObject
import java.util.Locale
import kotlin.math.abs

// What a crash report says and which ones to send. Plain functions, no Android
// types, so JVM tests cover them. Same event as the iOS shell's CrashReporter
// (ios/App/App/CrashReporter.swift): a Umami "crash" event whose stack frames
// are one property each ("frame00", "frame01", …; Umami keeps 500 characters
// per property).
//
// Privacy: class names, method names, line numbers and the Android version
// and device model only. Never an exception's message: it can hold a verse
// reference, a search, a URL.

/** Which build crashed, so a stack can be matched to that release's R8 mapping file. */
data class AppInfo(
    val versionName: String,
    val versionCode: Long,
    val androidRelease: String,
    val sdk: Int,
    val device: String,
)

/** What the system recorded about the last run's death (ApplicationExitInfo). */
data class Exit(val timestamp: Long, val kind: Kind, val status: Int) {
    enum class Kind { CRASH, NATIVE_CRASH, ANR }
}

object CrashReport {
    const val WEBSITE = "5f2a57be-86a2-4608-8fc5-667a9c24689c"
    const val MAX_FRAMES = 40
    const val MAX_FRAME_CHARS = 200
    const val MAX_BODY_BYTES = 16 * 1024
    private const val MAX_VALUE_CHARS = 500

    /** How far apart a saved Java crash and the system's record of it can be. */
    private const val SAME_CRASH_MS = 60_000L

    /** The cause chain's end: where it started, not where it was rethrown. */
    private const val MAX_CAUSE_DEPTH = 10

    fun fromThrowable(thread: Thread, error: Throwable, app: AppInfo): Map<String, String> {
        var root = error
        var depth = 0
        while (depth++ < MAX_CAUSE_DEPTH) {
            root = root.cause?.takeIf { it !== root } ?: break
        }
        val data = base(app, "java")
        data["thread"] = thread.name
        data["exception_type"] = error.javaClass.name
        if (root !== error) data["root_cause_type"] = root.javaClass.name
        addFrames(data, root.stackTrace.map { "${it.className}.${it.methodName}(${it.fileName}:${it.lineNumber})" })
        return data
    }

    fun fromExit(exit: Exit, anrFrames: List<String>, app: AppInfo): Map<String, String> {
        val data = base(app, exit.kind.name.lowercase())
        // The status of a native crash is the signal number (11 = SIGSEGV).
        if (exit.kind == Exit.Kind.NATIVE_CRASH) data["signal"] = exit.status.toString()
        addFrames(data, anrFrames)
        return data
    }

    private fun base(app: AppInfo, source: String) = linkedMapOf(
        "platform" to "android",
        "source" to source,
        "version" to app.versionName,
        "build" to app.versionCode.toString(),
        "os" to "Android ${app.androidRelease} (API ${app.sdk})",
        "device" to app.device,
    )

    private fun addFrames(data: MutableMap<String, String>, frames: List<String>) {
        frames.take(MAX_FRAMES).forEachIndexed { i, frame ->
            data[String.format(Locale.ROOT, "frame%02d", i)] = frame.take(MAX_FRAME_CHARS)
        }
    }

    /**
     * The Umami request body, within MAX_BODY_BYTES: values cut to the 500
     * characters Umami keeps, then frames dropped from the outermost end until
     * it fits (a sane report never gets there).
     */
    fun eventBody(data: Map<String, String>, language: String): String {
        val kept = LinkedHashMap(data.mapValues { it.value.take(MAX_VALUE_CHARS) })
        while (true) {
            val body = JSONObject()
                .put("type", "event")
                .put(
                    "payload",
                    JSONObject()
                        .put("website", WEBSITE)
                        .put("hostname", "android-app")
                        .put("tag", "android")
                        .put("url", "/")
                        .put("language", language)
                        .put("name", "crash")
                        .put("data", JSONObject(kept as Map<*, *>)),
                )
                .toString()
            if (body.toByteArray().size <= MAX_BODY_BYTES) return body
            // 50 values of 500 characters fit; without frames to drop it is as small as it gets.
            val last = kept.keys.lastOrNull { it.startsWith("frame") } ?: return body
            kept.remove(last)
        }
    }

    /**
     * Umami answers 200 {"beep":"boop"} to a request it takes for a bot, and
     * stores nothing: that is not accepted.
     */
    fun isAccepted(status: Int, responseBody: String) = status in 200..299 && !responseBody.contains("beep")

    /** The exits to look at, oldest first: after the last one handled, and not from an older install. */
    fun newExits(exits: List<Exit>, after: Long) = exits.filter { it.timestamp > after }.sortedBy { it.timestamp }

    /**
     * A plain crash the saved report (written by the uncaught exception
     * handler, with a stack) already covers; the system's record has none.
     */
    fun isCoveredBySavedReport(exit: Exit, savedAt: List<Long>) =
        exit.kind == Exit.Kind.CRASH && savedAt.any { abs(it - exit.timestamp) <= SAME_CRASH_MS }

    /** The "main" thread's Java frames from an ANR trace; the rest of the dump is left out. */
    fun anrMainThreadFrames(trace: String): List<String> {
        val frames = mutableListOf<String>()
        var inMain = false
        for (line in trace.lineSequence()) {
            if (line.startsWith("\"")) {
                if (inMain) break
                inMain = line.startsWith("\"main\"")
            } else if (inMain) {
                FRAME.matchEntire(line)?.let { frames += it.groupValues[1] }
            }
        }
        return frames
    }

    private val FRAME = Regex("""\s+at (\S+\(.*\))""")
}
