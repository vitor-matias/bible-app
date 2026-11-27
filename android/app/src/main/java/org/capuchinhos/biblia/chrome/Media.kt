package org.capuchinhos.biblia.chrome

import android.annotation.SuppressLint
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.os.IBinder
import android.support.v4.media.MediaMetadataCompat
import android.support.v4.media.session.MediaSessionCompat
import android.support.v4.media.session.PlaybackStateCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.media.app.NotificationCompat.MediaStyle
import org.capuchinhos.biblia.R
import org.json.JSONObject

/**
 * What the web app's player sends (MediaChrome in native-chrome.types.ts):
 * the +365 audio loaded, which the WebView doesn't show to the system.
 */
data class MediaState(
    val title: String,
    val artist: String,
    val playing: Boolean,
    /** Seconds into what is heard, whole. */
    val position: Double,
    /** Seconds; 0 while unknown. */
    val duration: Double,
    val rate: Double,
) {
    companion object {
        fun from(json: JSONObject) = MediaState(
            title = json.optString("title"),
            artist = json.optString("artist"),
            playing = json.optBoolean("playing"),
            position = json.optDouble("position", 0.0),
            duration = json.optDouble("duration", 0.0),
            rate = json.optDouble("rate", 1.0),
        )
    }
}

internal const val NOTIFICATION_ID = 365

/** The skip the player's buttons and the shade's make, in seconds. */
internal const val MEDIA_SKIP_SECONDS = 15

internal const val MEDIA_ACTIONS = PlaybackStateCompat.ACTION_PLAY or
    PlaybackStateCompat.ACTION_PAUSE or
    PlaybackStateCompat.ACTION_PLAY_PAUSE or
    PlaybackStateCompat.ACTION_SEEK_TO or
    PlaybackStateCompat.ACTION_REWIND or
    PlaybackStateCompat.ACTION_FAST_FORWARD

/** The position in milliseconds, never before the start nor past a known end. */
internal fun mediaPositionMs(state: MediaState): Long {
    val ms = (state.position * 1000).toLong().coerceAtLeast(0)
    return if (state.duration > 0) ms.coerceAtMost((state.duration * 1000).toLong()) else ms
}

/** The system runs the position on at this speed between updates: none when paused. */
internal fun mediaSpeed(state: MediaState): Float = if (state.playing) state.rate.toFloat() else 0f

/** Unknown length is -1 in the metadata, not 0. */
internal fun mediaDurationMs(state: MediaState): Long = if (state.duration > 0) (state.duration * 1000).toLong() else -1L

/** The web's action for the system's request: ids of NativeChromeAction ("media-…"). */
internal fun mediaSkipSeconds(forward: Boolean): Int = if (forward) MEDIA_SKIP_SECONDS else -MEDIA_SKIP_SECONDS

/**
 * The system's media session and its notification while +365 audio is loaded:
 * lock screen, shade and headset buttons. It only shows; the web player
 * plays, and is asked back through [send] (media-play, media-pause,
 * media-skip, media-seek). No foreground service: the audio plays in the web
 * view, which already keeps the app alive; the notification goes with the audio.
 */
internal class MediaSessionBridge(
    private val context: Context,
    private val send: (String, Int?) -> Unit,
) {
    private var session: MediaSessionCompat? = null
    private var listening = false
    private var shown = false

    private val actions = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            when (intent.action) {
                PLAY_PAUSE -> send(if (last?.playing == true) "media-pause" else "media-play", null)
                BACK -> send("media-skip", mediaSkipSeconds(false))
                FORWARD -> send("media-skip", mediaSkipSeconds(true))
            }
        }
    }
    private var last: MediaState? = null

    init {
        // A notification left by a process that died holds buttons nothing answers.
        NotificationManagerCompat.from(context).cancel(NOTIFICATION_ID)
    }

    fun update(state: MediaState?) {
        if (state == null) {
            end()
            return
        }
        last = state
        val session = session ?: start()
        session.setMetadata(
            MediaMetadataCompat.Builder()
                .putString(MediaMetadataCompat.METADATA_KEY_TITLE, state.title)
                .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, state.artist)
                .putLong(MediaMetadataCompat.METADATA_KEY_DURATION, mediaDurationMs(state))
                .build(),
        )
        session.setPlaybackState(
            PlaybackStateCompat.Builder()
                .setActions(MEDIA_ACTIONS)
                .setState(
                    if (state.playing) PlaybackStateCompat.STATE_PLAYING else PlaybackStateCompat.STATE_PAUSED,
                    mediaPositionMs(state),
                    mediaSpeed(state),
                )
                .build(),
        )
        notify(session, state)
    }

    fun end() {
        last = null
        session?.apply {
            isActive = false
            release()
        }
        session = null
        if (shown) NotificationManagerCompat.from(context).cancel(NOTIFICATION_ID)
        shown = false
        context.stopService(Intent(context, MediaCleanupService::class.java))
        if (listening) {
            try {
                context.unregisterReceiver(actions)
            } catch (_: IllegalArgumentException) {
                // Not registered.
            }
            listening = false
        }
    }

    private fun start(): MediaSessionCompat {
        val created = MediaSessionCompat(context, "Biblia").apply {
            setCallback(object : MediaSessionCompat.Callback() {
                override fun onPlay() = send("media-play", null)
                override fun onPause() = send("media-pause", null)
                override fun onRewind() = send("media-skip", mediaSkipSeconds(false))
                override fun onFastForward() = send("media-skip", mediaSkipSeconds(true))
                override fun onSeekTo(pos: Long) = send("media-seek", (pos / 1000).toInt())
            })
            isActive = true
        }
        val filter = IntentFilter().apply {
            addAction(PLAY_PAUSE)
            addAction(BACK)
            addAction(FORWARD)
        }
        ContextCompat.registerReceiver(context, actions, filter, ContextCompat.RECEIVER_NOT_EXPORTED)
        listening = true
        session = created
        return created
    }

    private fun intent(action: String) = PendingIntent.getBroadcast(
        context,
        0,
        Intent(action).setPackage(context.packageName),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    // No POST_NOTIFICATIONS check: Android 13+ exempts a MediaStyle notification
    // carrying a media session token (as this one does) from that permission.
    @SuppressLint("MissingPermission")
    private fun notify(session: MediaSessionCompat, state: MediaState) {
        val manager = NotificationManagerCompat.from(context)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            manager.createNotificationChannel(
                NotificationChannel(CHANNEL, "Áudio", NotificationManager.IMPORTANCE_LOW),
            )
        }
        val open = context.packageManager.getLaunchIntentForPackage(context.packageName)?.let {
            PendingIntent.getActivity(context, 0, it, PendingIntent.FLAG_IMMUTABLE)
        }
        val notification = NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_headphones)
            .setContentTitle(state.title)
            .setContentText(state.artist)
            .setContentIntent(open)
            .setOnlyAlertOnce(true)
            .setOngoing(state.playing)
            .setSilent(true)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .addAction(R.drawable.ic_replay_15, "Recuar 15 segundos", intent(BACK))
            .addAction(
                if (state.playing) R.drawable.ic_pause_filled else R.drawable.ic_play_arrow_filled,
                if (state.playing) "Pausa" else "Reproduzir",
                intent(PLAY_PAUSE),
            )
            .addAction(R.drawable.ic_forward_15, "Avançar 15 segundos", intent(FORWARD))
            .setStyle(MediaStyle().setMediaSession(session.sessionToken).setShowActionsInCompactView(0, 1, 2))
            .build()
        manager.notify(NOTIFICATION_ID, notification)
        shown = true
        // A started service is told when the task is swiped away, which the
        // process may not outlive; it takes the notification down then.
        try {
            context.startService(Intent(context, MediaCleanupService::class.java))
        } catch (_: IllegalStateException) {
            // Started from the background: the next launch cancels it instead.
        }
    }

    private companion object {
        const val CHANNEL = "media"
        const val PLAY_PAUSE = "org.capuchinhos.biblia.MEDIA_PLAY_PAUSE"
        const val BACK = "org.capuchinhos.biblia.MEDIA_BACK"
        const val FORWARD = "org.capuchinhos.biblia.MEDIA_FORWARD"
    }
}

/**
 * Exists only to hear the task swiped from recents (a started service with
 * stopWithTask off gets onTaskRemoved) and take the notification down, since
 * the process can die without running any other cleanup.
 */
internal class MediaCleanupService : Service() {
    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int) = START_NOT_STICKY

    // Only when the task goes: Android also stops an idle started service
    // about a minute into the background, which, cancelling here, took a
    // paused notification away. end() cancels it when listening ends.
    override fun onTaskRemoved(rootIntent: Intent?) {
        NotificationManagerCompat.from(this).cancel(NOTIFICATION_ID)
        stopSelf()
    }
}
