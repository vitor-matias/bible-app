package org.capuchinhos.biblia.crash

import com.sun.net.httpserver.HttpServer
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.net.InetAddress
import java.net.InetSocketAddress

/** Delivery against a local fake Umami on the loopback: nothing leaves the machine. */
class CrashReporterTest {
    @get:Rule
    val folder = TemporaryFolder()

    private val app = AppInfo("1.2.3", 1002003, "14", 34, "Google Pixel 9")
    private lateinit var server: HttpServer
    private val received = mutableListOf<Pair<String, String?>>() // body, User-Agent
    private var status = 200
    private var reply = """{"cache":"c","sessionId":"s","visitId":"v"}"""

    @Before
    fun startServer() {
        server = HttpServer.create(InetSocketAddress(InetAddress.getLoopbackAddress(), 0), 0)
        server.createContext("/api/send") { exchange ->
            received += exchange.requestBody.readBytes().decodeToString() to exchange.requestHeaders.getFirst("User-Agent")
            val bytes = reply.toByteArray()
            exchange.sendResponseHeaders(status, bytes.size.toLong())
            exchange.responseBody.use { it.write(bytes) }
        }
        server.start()
    }

    @After
    fun stopServer() = server.stop(0)

    private fun reporter(endpoint: String = "http://127.0.0.1:${server.address.port}/api/send") =
        CrashReporter(folder.root.resolve("crash-reports"), endpoint, app)

    @Test
    fun aSavedCrashIsSentOnceAndThenDeleted() {
        val r = reporter()
        r.save(Thread.currentThread(), IllegalStateException("Jo 3:16"), now = 1000)
        r.sendSaved()
        r.sendSaved()

        assertEquals(1, received.size)
        val (body, userAgent) = received.single()
        val payload = JSONObject(body).getJSONObject("payload")
        assertEquals("crash", payload.getString("name"))
        assertEquals("java.lang.IllegalStateException", payload.getJSONObject("data").getString("exception_type"))
        assertFalse(body.contains("Jo 3:16"))
        assertTrue(userAgent!!.startsWith("Mozilla/5.0") && !userAgent.contains("Dalvik"))
        assertTrue(r.savedAt().isEmpty())
    }

    @Test
    fun aReportUmamiRefusesOrTakesForABotStaysForNextLaunch() {
        val r = reporter()
        r.save(Thread.currentThread(), RuntimeException(), now = 1000)

        status = 500
        r.sendSaved()
        assertEquals(listOf(1000L), r.savedAt())

        status = 200
        reply = """{"beep":"boop"}"""
        r.sendSaved()
        assertEquals(listOf(1000L), r.savedAt())

        reply = """{"sessionId":"s"}"""
        r.sendSaved()
        assertTrue(r.savedAt().isEmpty())
    }

    @Test
    fun aReportStaysWhenTheServerCannotBeReached() {
        val r = reporter("http://127.0.0.1:1/api/send")
        r.save(Thread.currentThread(), RuntimeException(), now = 1000)
        r.sendSaved()
        assertEquals(listOf(1000L), r.savedAt())
    }

    @Test
    fun aCrashLoopKeepsOnlyTheNewestReports() {
        val r = reporter()
        (1L..8L).forEach { r.save(Thread.currentThread(), RuntimeException(), now = it) }
        assertEquals(listOf(4L, 5L, 6L, 7L, 8L), r.savedAt())
    }

    @Test
    fun anUnreadableReportIsDroppedAndDoesNotBlockTheNext() {
        val r = reporter()
        r.save(Thread.currentThread(), RuntimeException(), now = 2000)
        folder.root.resolve("crash-reports/crash-1000.json").writeText("{not json")
        r.sendSaved()
        assertEquals(1, received.size)
        assertTrue(r.savedAt().isEmpty())
    }

    @Test
    fun theHandlerSavesTheCrashAndHandsItOnToThePreviousHandler() {
        val original = Thread.getDefaultUncaughtExceptionHandler()
        var delegated: Throwable? = null
        Thread.setDefaultUncaughtExceptionHandler { _, e -> delegated = e }
        try {
            val r = reporter()
            r.installHandler()
            val error = IllegalStateException("boom")
            Thread.getDefaultUncaughtExceptionHandler()!!.uncaughtException(Thread.currentThread(), error)
            assertEquals(error, delegated)
            assertEquals(1, r.savedAt().size)
        } finally {
            Thread.setDefaultUncaughtExceptionHandler(original)
        }
    }

    @Test
    fun savingNeverThrowsEvenWhenTheDirectoryCannotBeMade() {
        folder.root.resolve("blocked").writeText("a file where the directory should be")
        CrashReporter(folder.root.resolve("blocked"), "http://127.0.0.1:1/", app)
            .save(Thread.currentThread(), RuntimeException())
    }
}
