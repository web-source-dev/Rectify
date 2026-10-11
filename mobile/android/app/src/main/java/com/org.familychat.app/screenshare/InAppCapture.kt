package org.familychat.app.screenshare

import android.graphics.Bitmap
import android.graphics.Canvas
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.Looper
import android.view.PixelCopy
import com.facebook.react.bridge.ReactApplicationContext
import java.io.ByteArrayOutputStream
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Copies this app's own window on a timer. It does not use MediaProjection,
 * so other apps are never included. The person turns it on from the chat.
 */
class InAppCapture(private val reactContext: ReactApplicationContext) {
  private val running = AtomicBoolean(false)
  private val copyInFlight = AtomicBoolean(false)
  private val mainHandler = Handler(Looper.getMainLooper())
  private var thread: HandlerThread? = null
  private var handler: Handler? = null
  private var full: Bitmap? = null
  private var generation = 0

  fun start(): Boolean {
    if (running.get()) return true
    val worker = HandlerThread("in-app-share")
    worker.start()
    thread = worker
    val loop = Handler(worker.looper)
    handler = loop
    running.set(true)
    loop.post(tick)
    return true
  }

  fun stop() {
    val orphan = full
    val inFlight = copyInFlight.get()
    generation += 1
    running.set(false)
    copyInFlight.set(false)
    full = null
    if (!inFlight) recycleQuietly(orphan)
    val loop = handler
    handler = null
    loop?.removeCallbacksAndMessages(null)
    thread?.quitSafely()
    thread = null
  }

  private val tick = object : Runnable {
    override fun run() {
      val loop = handler ?: return
      if (!running.get()) return
      requestCopy()
      loop.postDelayed(this, FRAME_GAP_MS)
    }
  }

  private fun requestCopy() {
    if (!running.get() || !copyInFlight.compareAndSet(false, true)) return
    val gen = generation
    val activity = reactContext.currentActivity
    val decor = activity?.window?.decorView
    val srcW = decor?.width ?: 0
    val srcH = decor?.height ?: 0
    if (
      activity == null ||
      activity.isFinishing ||
      activity.isDestroyed ||
      decor == null ||
      srcW < 2 ||
      srcH < 2
    ) {
      copyInFlight.set(false)
      return
    }
    val buffer = bitmapFor(srcW, srcH)
    if (buffer == null) {
      copyInFlight.set(false)
      return
    }

    reactContext.runOnUiQueueThread {
      if (!running.get() || gen != generation) {
        copyInFlight.set(false)
        return@runOnUiQueueThread
      }
      try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          PixelCopy.request(
            activity.window,
            buffer,
            { result -> deliver(gen, buffer, srcW, srcH, result == PixelCopy.SUCCESS) },
            mainHandler,
          )
        } else {
          val ok = drawView(decor, buffer)
          deliver(gen, buffer, srcW, srcH, ok)
        }
      } catch (_: Exception) {
        copyInFlight.set(false)
      }
    }
  }

  private fun deliver(gen: Int, buffer: Bitmap, srcW: Int, srcH: Int, ok: Boolean) {
    val loop = handler
    if (loop == null) {
      if (gen != generation) recycleQuietly(buffer)
      else copyInFlight.set(false)
      return
    }
    loop.post {
      try {
        if (ok && running.get() && gen == generation) {
          publish(buffer, srcW, srcH)
        }
      } finally {
        if (gen != generation) recycleQuietly(buffer)
        else copyInFlight.set(false)
      }
    }
  }

  private fun publish(buffer: Bitmap, srcW: Int, srcH: Int) {
    val width = even(if (srcW > MAX_WIDTH) MAX_WIDTH else srcW)
    val height = even((srcH * (width.toFloat() / srcW)).toInt())
    val scaled = if (buffer.width == width && buffer.height == height) {
      buffer
    } else {
      Bitmap.createScaledBitmap(buffer, width, height, true)
    }
    try {
      val jpeg = encode(scaled) ?: return
      ScreenShareBridge.emitFrame(jpeg, "inAppShareFrame")
    } finally {
      if (scaled !== buffer) recycleQuietly(scaled)
    }
  }

  private fun bitmapFor(width: Int, height: Int): Bitmap? {
    val current = full
    if (current != null && !current.isRecycled && current.width == width && current.height == height) {
      return current
    }
    recycleQuietly(current)
    full = null
    return try {
      Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888).also { full = it }
    } catch (_: Exception) {
      null
    } catch (_: OutOfMemoryError) {
      null
    }
  }

  private fun drawView(view: android.view.View, target: Bitmap): Boolean {
    return try {
      val canvas = Canvas(target)
      canvas.scale(target.width.toFloat() / view.width, target.height.toFloat() / view.height)
      view.draw(canvas)
      true
    } catch (_: Exception) {
      false
    }
  }

  private fun encode(source: Bitmap): ByteArray? {
    val out = ByteArrayOutputStream()
    if (!source.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, out)) return null
    val bytes = out.toByteArray()
    return if (bytes.size < 32) null else bytes
  }

  private fun recycleQuietly(bitmap: Bitmap?) {
    if (bitmap == null || bitmap.isRecycled) return
    try {
      bitmap.recycle()
    } catch (_: Exception) {
    }
  }

  companion object {
    private const val MAX_WIDTH = 720
    private const val FRAME_GAP_MS = 400L
    private const val JPEG_QUALITY = 50

    private fun even(value: Int): Int = (value.coerceAtLeast(2) / 2) * 2
  }
}
