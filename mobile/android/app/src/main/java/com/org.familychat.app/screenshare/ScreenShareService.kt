package org.familychat.app.screenshare

import android.app.Activity
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import android.os.Looper
import android.os.SystemClock
import android.provider.Settings
import android.util.TypedValue
import android.view.Gravity
import android.view.WindowManager
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.app.NotificationCompat
import org.familychat.app.MainActivity
import org.familychat.app.R
import java.io.ByteArrayOutputStream
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Foreground capture session started only after the person accepts Android's
 * screen-share dialog. A notification stays up for the whole session, and a
 * small on-screen control appears if they leave the app and have allowed it.
 */
class ScreenShareService : Service() {
  private val released = AtomicBoolean(false)
  private val mainHandler = Handler(Looper.getMainLooper())

  private var capturing = false
  private var announced = false
  private var mediaProjection: MediaProjection? = null
  private var virtualDisplay: VirtualDisplay? = null
  private var imageReader: ImageReader? = null
  private var handlerThread: HandlerThread? = null
  private var projectionCallback: MediaProjection.Callback? = null
  private var bubble: LinearLayout? = null
  private var lastFrameMs = 0L
  private var reusable: Bitmap? = null
  private val jpegBuffer = ByteArrayOutputStream(96 * 1024)

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_STOP -> shutdown()
      ACTION_SHOW_BUBBLE -> if (capturing) showBubble() else stopSelf()
      ACTION_HIDE_BUBBLE -> {
        hideBubble()
        if (!capturing) stopSelf()
      }
      ACTION_START -> startCapture(intent)
      else -> if (!capturing) shutdown()
    }
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    shutdown()
    super.onDestroy()
  }

  private fun startCapture(intent: Intent) {
    if (capturing) {
      ScreenShareBridge.signalReady()
      return
    }
    if (released.get()) {
      ScreenShareBridge.signalFailed()
      return
    }
    val resultCode = intent.getIntExtra(EXTRA_RESULT_CODE, Activity.RESULT_CANCELED)
    val data = projectionResult(intent)
    if (resultCode != Activity.RESULT_OK || data == null) {
      shutdown()
      return
    }

    try {
      startInForeground()
      announced = true
      val manager = getSystemService(MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
      val projection = manager.getMediaProjection(resultCode, data)
      if (projection == null) {
        shutdown()
        return
      }
      mediaProjection = projection

      val thread = HandlerThread("screen-share")
      thread.start()
      handlerThread = thread
      val handler = Handler(thread.looper)

      val callback = object : MediaProjection.Callback() {
        override fun onStop() {
          mainHandler.post { shutdown() }
        }
      }
      projectionCallback = callback
      projection.registerCallback(callback, handler)

      val metrics = resources.displayMetrics
      val srcW = metrics.widthPixels.coerceAtLeast(2)
      val srcH = metrics.heightPixels.coerceAtLeast(2)
      val width = even(if (srcW > MAX_WIDTH) MAX_WIDTH else srcW)
      val height = even((srcH * (width.toFloat() / srcW)).toInt())
      val reader = ImageReader.newInstance(width, height, PixelFormat.RGBA_8888, 3)
      imageReader = reader
      reader.setOnImageAvailableListener({ imageReader -> onImage(imageReader, width, height) }, handler)

      virtualDisplay = projection.createVirtualDisplay(
        "chat-screen-share",
        width,
        height,
        metrics.densityDpi,
        DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
        reader.surface,
        null,
        handler,
      )
      capturing = true
      running = true
      ScreenShareBridge.signalReady()
    } catch (_: Exception) {
      shutdown()
    }
  }

  private fun onImage(reader: ImageReader, width: Int, height: Int) {
    if (released.get()) return
    val image = try {
      reader.acquireLatestImage()
    } catch (_: Exception) {
      null
    } ?: return
    var jpeg: ByteArray? = null
    try {
      val now = SystemClock.elapsedRealtime()
      if (now - lastFrameMs >= FRAME_GAP_MS) {
        lastFrameMs = now
        jpeg = encodeJpeg(image, width, height)
      }
    } catch (_: Exception) {
      jpeg = null
    } finally {
      image.close()
    }
    if (jpeg != null) {
      ScreenShareBridge.emitFrame(jpeg)
    }
  }

  private fun encodeJpeg(image: android.media.Image, width: Int, height: Int): ByteArray? {
    val plane = image.planes.firstOrNull() ?: return null
    val buffer = plane.buffer
    val pixelStride = plane.pixelStride
    if (pixelStride <= 0 || width <= 0 || height <= 0) return null
    val rowStride = plane.rowStride
    val rowPadding = rowStride - pixelStride * width
    val bitmapWidth = width + (rowPadding / pixelStride).coerceAtLeast(0)
    buffer.rewind()
    val current = reusable
    val full = if (current != null && !current.isRecycled && current.width == bitmapWidth && current.height == height) {
      current
    } else {
      if (current != null && !current.isRecycled) current.recycle()
      Bitmap.createBitmap(bitmapWidth, height, Bitmap.Config.ARGB_8888).also { reusable = it }
    }
    full.copyPixelsFromBuffer(buffer)
    val cropped = if (bitmapWidth == width) full else Bitmap.createBitmap(full, 0, 0, width, height)
    jpegBuffer.reset()
    cropped.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, jpegBuffer)
    if (cropped !== full) cropped.recycle()
    val bytes = jpegBuffer.toByteArray()
    return if (bytes.size < 32) null else bytes
  }

  private fun startInForeground() {
    val notification = buildNotification()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION)
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
  }

  private fun buildNotification(): Notification {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(
        CHANNEL_ID,
        "Screen sharing",
        NotificationManager.IMPORTANCE_LOW,
      ).apply {
        description = "Shown while you are sharing your screen in the chat"
        setSound(null, null)
      }
      getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }

    val open = PendingIntent.getActivity(
      this,
      2,
      Intent(this, MainActivity::class.java).apply {
        flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
      },
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    val stop = PendingIntent.getService(
      this,
      3,
      Intent(this, ScreenShareService::class.java).apply { action = ACTION_STOP },
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(R.drawable.ic_screen_share)
      .setContentTitle("Sharing your screen")
      .setContentText("People in the chat can watch. Tap Stop to end it.")
      .setContentIntent(open)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setCategory(NotificationCompat.CATEGORY_SERVICE)
      .addAction(0, "Stop", stop)
      .build()
  }

  private fun showBubble() {
    if (bubble != null || !Settings.canDrawOverlays(this)) return
    val windowManager = getSystemService(WINDOW_SERVICE) as WindowManager
    val density = resources.displayMetrics.density
    fun dp(value: Int) = (value * density).toInt()

    val card = LinearLayout(this).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER_VERTICAL
      setPadding(dp(16), dp(8), dp(8), dp(8))
      background = GradientDrawable().apply {
        setColor(Color.parseColor("#1C2534"))
        cornerRadius = dp(24).toFloat()
      }
      elevation = dp(6).toFloat()
    }

    val label = TextView(this).apply {
      text = "Sharing screen"
      setTextColor(Color.WHITE)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
      setPadding(0, 0, dp(12), 0)
      setOnClickListener { openApp() }
    }
    val stop = TextView(this).apply {
      text = "Stop"
      setTextColor(Color.WHITE)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
      gravity = Gravity.CENTER
      minWidth = dp(48)
      minHeight = dp(40)
      background = GradientDrawable().apply {
        setColor(Color.parseColor("#D3372F"))
        cornerRadius = dp(20).toFloat()
      }
      setPadding(dp(14), dp(8), dp(14), dp(8))
      setOnClickListener { shutdown() }
    }
    card.addView(label)
    card.addView(stop)

    val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
    } else {
      @Suppress("DEPRECATION")
      WindowManager.LayoutParams.TYPE_PHONE
    }
    val params = WindowManager.LayoutParams(
      WindowManager.LayoutParams.WRAP_CONTENT,
      WindowManager.LayoutParams.WRAP_CONTENT,
      type,
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
      PixelFormat.TRANSLUCENT,
    ).apply {
      gravity = Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL
      y = dp(24)
    }

    try {
      windowManager.addView(card, params)
      bubble = card
    } catch (_: Exception) {
      bubble = null
    }
  }

  private fun hideBubble() {
    val card = bubble ?: return
    bubble = null
    try {
      (getSystemService(WINDOW_SERVICE) as WindowManager).removeView(card)
    } catch (_: Exception) {
      // Already detached.
    }
  }

  private fun openApp() {
    startActivity(
      Intent(this, MainActivity::class.java).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
      },
    )
  }

  private fun shutdown() {
    if (!released.compareAndSet(false, true)) return
    capturing = false
    running = false
    hideBubble()
    val projection = mediaProjection
    val callback = projectionCallback
    mediaProjection = null
    projectionCallback = null
    try {
      virtualDisplay?.release()
    } catch (_: Exception) {
    }
    virtualDisplay = null
    try {
      imageReader?.close()
    } catch (_: Exception) {
    }
    imageReader = null
    if (projection != null && callback != null) {
      try {
        projection.unregisterCallback(callback)
      } catch (_: Exception) {
      }
    }
    try {
      projection?.stop()
    } catch (_: Exception) {
    }
    handlerThread?.quitSafely()
    handlerThread = null
    val bitmap = reusable
    reusable = null
    if (bitmap != null && !bitmap.isRecycled) {
      try {
        bitmap.recycle()
      } catch (_: Exception) {
      }
    }
    ScreenShareBridge.signalFailed()
    if (announced) {
      ScreenShareBridge.emitStopped()
    }
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
        stopForeground(STOP_FOREGROUND_REMOVE)
      } else {
        @Suppress("DEPRECATION")
        stopForeground(true)
      }
    } catch (_: Exception) {
    }
    stopSelf()
  }

  private fun projectionResult(intent: Intent): Intent? {
    return if (Build.VERSION.SDK_INT >= 33) {
      intent.getParcelableExtra(EXTRA_DATA, Intent::class.java)
    } else {
      @Suppress("DEPRECATION")
      intent.getParcelableExtra(EXTRA_DATA)
    }
  }

  companion object {
    const val ACTION_START = "org.familychat.app.screenshare.START"
    const val ACTION_STOP = "org.familychat.app.screenshare.STOP"
    const val ACTION_SHOW_BUBBLE = "org.familychat.app.screenshare.SHOW_BUBBLE"
    const val ACTION_HIDE_BUBBLE = "org.familychat.app.screenshare.HIDE_BUBBLE"
    const val EXTRA_RESULT_CODE = "resultCode"
    const val EXTRA_DATA = "data"

    private const val CHANNEL_ID = "screen_share"
    private const val NOTIFICATION_ID = 4402
    private const val MAX_WIDTH = 720
    private const val FRAME_GAP_MS = 33L
    private const val JPEG_QUALITY = 55

    @Volatile
    var running = false

    fun startIntent(context: Context, resultCode: Int, data: Intent): Intent {
      return Intent(context, ScreenShareService::class.java).apply {
        action = ACTION_START
        putExtra(EXTRA_RESULT_CODE, resultCode)
        putExtra(EXTRA_DATA, data)
      }
    }

    private fun even(value: Int): Int = (value.coerceAtLeast(2) / 2) * 2
  }
}
