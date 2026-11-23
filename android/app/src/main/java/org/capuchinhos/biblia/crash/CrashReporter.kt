package org.capuchinhos.biblia.crash

import org.json.JSONObject
import java.io.File
import java.io.Reader
import java.net.HttpURLConnection
import java.net.URL
import java.util.Locale

/**
 * Saves a crash's report to app-private storage as it happens, and sends the
 * saved ones to Umami on a later launch. No Android types: CrashReporting wires
 * it to the system.
 *
 * A report is deleted only once Umami accepted it; until then it stays for the
 * next launch (a crash loop keeps the newest MAX_SAVED). A report that cannot
 * be sent or saved is dropped without a word: this must never be what crashes.
 */
class CrashReporter(
    private val dir: File,
    private val endpoint: String,
    val app: AppInfo,
) {
    /** Runs inside the dying process: synchronous, and nothing in it may throw. */
    fun save(thread: Thread, error: Throwable, now: Long = System.currentTimeMillis()) {
        try {
            dir.mkdirs()
            val data = CrashReport.fromThrowable(thread, error, app)
            File(dir, "crash-$now.json").writeText(JSONObject(data as Map<*, *>).toString())
            savedFiles().dropLast(MAX_SAVED).forEach { it.delete() }
        } catch (_: Throwable) {
        }
    }

    /** When the saved reports were written, from their file names. */
    fun savedAt(): List<Long> = savedFiles().mapNotNull { timestamp(it) }

    /** Sends the saved reports, oldest first, stopping at the first that is not accepted. */
    fun sendSaved() {
        for (file in savedFiles()) {
            val sent = try {
                val json = JSONObject(file.readText())
                send(json.keys().asSequence().associateWith { json.getString(it) })
            } catch (_: Exception) {
                // Unreadable: it will never send, so it must not block the rest.
                file.delete()
                continue
            }
            if (!sent) return
            file.delete()
        }
    }

    /** True once Umami accepted the report. */
    fun send(data: Map<String, String>): Boolean {
        val body = CrashReport.eventBody(data, Locale.getDefault().toLanguageTag()).toByteArray()
        var connection: HttpURLConnection? = null
        return try {
            connection = (URL(endpoint).openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                connectTimeout = TIMEOUT_MS
                readTimeout = TIMEOUT_MS
                instanceFollowRedirects = false
                doOutput = true
                setFixedLengthStreamingMode(body.size)
                setRequestProperty("Content-Type", "application/json")
                // A browser's, as the app's other events carry (the WebView's):
                // Umami files anything else, HttpURLConnection's Dalvik too, as a bot.
                setRequestProperty("User-Agent", userAgent(app))
            }
            connection.outputStream.use { it.write(body) }
            val status = connection.responseCode
            val stream = if (status < 400) connection.inputStream else connection.errorStream
            val response = stream?.bufferedReader()?.use { it.readUpTo(MAX_RESPONSE_CHARS) } ?: ""
            CrashReport.isAccepted(status, response)
        } catch (_: Exception) {
            false
        } finally {
            connection?.disconnect()
        }
    }

    /** Hands uncaught exceptions to [save] first, then to the handler the system installed. */
    fun installHandler() {
        val previous = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, error ->
            save(thread, error)
            // The system's handler ends the process as usual.
            previous?.uncaughtException(thread, error)
        }
    }

    private fun savedFiles(): List<File> =
        dir.listFiles { f -> timestamp(f) != null }?.sortedBy { timestamp(it) } ?: emptyList()

    private fun timestamp(file: File) = file.name.removePrefix("crash-").removeSuffix(".json").toLongOrNull()

    companion object {
        private const val TIMEOUT_MS = 15_000
        private const val MAX_RESPONSE_CHARS = 1024
        private const val MAX_SAVED = 5

        fun userAgent(app: AppInfo) =
            "Mozilla/5.0 (Linux; Android ${app.androidRelease}) AppleWebKit/537.36 " +
                "(KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
    }
}

/** At most [max] characters: a response or trace is read for a few lines, not to the end. */
internal fun Reader.readUpTo(max: Int): String {
    val text = StringBuilder()
    val buffer = CharArray(4096)
    while (text.length < max) {
        val n = read(buffer, 0, minOf(buffer.size, max - text.length))
        if (n < 0) break
        text.append(buffer, 0, n)
    }
    return text.toString()
}
