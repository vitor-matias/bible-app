package org.capuchinhos.biblia.crash

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class CrashReportTest {
    private val app = AppInfo("1.2.3", 1002003, "14", 34, "Google Pixel 9")

    private fun deep(n: Int): Throwable {
        fun recurse(i: Int): Throwable = if (i == 0) IllegalStateException("Gn 1:1 https://x") else recurse(i - 1)
        return recurse(n)
    }

    @Test
    fun aJavaCrashHasTypeFramesAndTheBuildButNotTheMessage() {
        val data = CrashReport.fromThrowable(Thread.currentThread(), deep(2), app)
        assertEquals("java.lang.IllegalStateException", data["exception_type"])
        assertEquals("android", data["platform"])
        assertEquals("1.2.3", data["version"])
        assertEquals("1002003", data["build"])
        assertEquals("Android 14 (API 34)", data["os"])
        assertTrue(data.getValue("frame00").startsWith("org.capuchinhos.biblia.crash.CrashReportTest"))
        assertTrue(data.none { it.value.contains("Gn 1:1") || it.value.contains("https://x") })
    }

    @Test
    fun theFramesAreCappedAndTruncated() {
        val data = CrashReport.fromThrowable(Thread.currentThread(), deep(500), app)
        assertEquals(CrashReport.MAX_FRAMES, data.keys.count { it.startsWith("frame") })
        assertTrue(data.containsKey("frame39"))
        assertFalse(data.containsKey("frame40"))
        val long = RuntimeException().apply { stackTrace = arrayOf(StackTraceElement("a".repeat(500), "m", "F.java", 1)) }
        val frame = CrashReport.fromThrowable(Thread.currentThread(), long, app).getValue("frame00")
        assertEquals(CrashReport.MAX_FRAME_CHARS, frame.length)
    }

    @Test
    fun aWrappedCrashIsReportedFromItsRootCause() {
        val root = IllegalArgumentException("secret")
        val wrapper = RuntimeException("outer", RuntimeException("middle", root))
        val data = CrashReport.fromThrowable(Thread.currentThread(), wrapper, app)
        assertEquals("java.lang.RuntimeException", data["exception_type"])
        assertEquals("java.lang.IllegalArgumentException", data["root_cause_type"])
    }

    @Test
    fun aCauseCycleDoesNotHangTheHandler() {
        val a = RuntimeException("a")
        val b = RuntimeException("b", a)
        a.initCause(b)
        assertEquals("java.lang.RuntimeException", CrashReport.fromThrowable(Thread.currentThread(), a, app)["exception_type"])
    }

    @Test
    fun theEventMatchesTheIosShape() {
        val data = CrashReport.fromThrowable(Thread.currentThread(), deep(1), app)
        val payload = JSONObject(CrashReport.eventBody(data, "pt-PT")).getJSONObject("payload")
        assertEquals(CrashReport.WEBSITE, payload.getString("website"))
        assertEquals("android-app", payload.getString("hostname"))
        assertEquals("crash", payload.getString("name"))
        assertEquals("/", payload.getString("url"))
        assertEquals("pt-PT", payload.getString("language"))
        assertEquals("1.2.3", payload.getJSONObject("data").getString("version"))
    }

    @Test
    fun aHugeReportIsCutToFitByDroppingTheOutermostFramesFirst() {
        val data = linkedMapOf("version" to "1")
        repeat(40) { data["frame%02d".format(it)] = "x".repeat(500) }
        data["exception_type"] = "y".repeat(20_000)
        val body = CrashReport.eventBody(data, "pt")
        assertTrue(body.toByteArray().size <= CrashReport.MAX_BODY_BYTES)
        val kept = JSONObject(body).getJSONObject("payload").getJSONObject("data")
        assertFalse(kept.has("frame39"))
        assertEquals("1", kept.getString("version"))
        assertEquals(500, kept.getString("exception_type").length)
    }

    @Test
    fun anAcceptedReportIsA2xxThatUmamiDidNotTakeForABot() {
        assertTrue(CrashReport.isAccepted(200, """{"cache":"x","sessionId":"y"}"""))
        assertFalse(CrashReport.isAccepted(200, """{"beep":"boop"}"""))
        assertFalse(CrashReport.isAccepted(400, ""))
        assertFalse(CrashReport.isAccepted(500, "oops"))
    }

    @Test
    fun onlyExitsAfterTheLastHandledOneAreNewAndOldestComesFirst() {
        val exits = listOf(
            Exit(300, Exit.Kind.ANR, 0),
            Exit(100, Exit.Kind.CRASH, 0),
            Exit(200, Exit.Kind.NATIVE_CRASH, 11),
        )
        assertEquals(listOf(200L, 300L), CrashReport.newExits(exits, 100).map { it.timestamp })
        assertTrue(CrashReport.newExits(exits, 300).isEmpty())
    }

    @Test
    fun aPlainCrashTheSavedReportCoversIsNotSentTwice() {
        val crash = Exit(100_000, Exit.Kind.CRASH, 0)
        assertTrue(CrashReport.isCoveredBySavedReport(crash, listOf(99_500)))
        assertFalse(CrashReport.isCoveredBySavedReport(crash, listOf(1_000)))
        assertFalse(CrashReport.isCoveredBySavedReport(crash, emptyList()))
        // A native crash or ANR has no saved report to be covered by.
        assertFalse(CrashReport.isCoveredBySavedReport(Exit(100_000, Exit.Kind.ANR, 0), listOf(100_000)))
    }

    @Test
    fun aNativeCrashCarriesItsSignalAndAnAnrItsMainThreadFrames() {
        val native = CrashReport.fromExit(Exit(1, Exit.Kind.NATIVE_CRASH, 11), emptyList(), app)
        assertEquals("11", native["signal"])
        assertEquals("native_crash", native["source"])
        val anr = CrashReport.fromExit(Exit(1, Exit.Kind.ANR, 0), listOf("a.B.c(B.java:1)"), app)
        assertEquals("a.B.c(B.java:1)", anr["frame00"])
        assertNull(anr["signal"])
    }

    @Test
    fun anAnrTraceYieldsOnlyTheMainThreadsJavaFrames() {
        val trace = """
            ----- pid 1 at 2026-01-01 -----
            Cmd line: org.capuchinhos.biblia

            "Signal Catcher" prio=10 tid=2 Runnable
              at com.other.Thread.skip(Thread.java:1)

            "main" prio=5 tid=1 Native
              | group="main" sCount=1
              native: #00 pc 0000000000012345  /apex/libc.so (syscall+28)
              at android.os.MessageQueue.nativePollOnce(Native Method)
              - waiting on <0x0a1b2c3d> (a java.lang.Object)
              at org.capuchinhos.biblia.Foo.bar(Foo.kt:12)

            "pool-1-thread-1" prio=5 tid=9 Waiting
              at com.other.Pool.skip(Pool.java:2)
        """.trimIndent()
        assertEquals(
            listOf("android.os.MessageQueue.nativePollOnce(Native Method)", "org.capuchinhos.biblia.Foo.bar(Foo.kt:12)"),
            CrashReport.anrMainThreadFrames(trace),
        )
        assertTrue(CrashReport.anrMainThreadFrames("garbage").isEmpty())
    }
}
