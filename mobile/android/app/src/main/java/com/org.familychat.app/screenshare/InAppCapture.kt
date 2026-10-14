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
  private val jpegBuffer = ByteArrayOutputStream(96 * 1024)

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
    val (dstW, dstH) = targetSize(srcW, srcH)
    val buffer = bitmapFor(dstW, dstH)
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
            { result -> deliver(gen, buffer, result == PixelCopy.SUCCESS) },
            mainHandler,
          )
        } else {
          val ok = drawView(decor, buffer)
          deliver(gen, buffer, ok)
        }
      } catch (_: Exception) {
        copyInFlight.set(false)
      }
    }
  }

  private fun deliver(gen: Int, buffer: Bitmap, ok: Boolean) {
    val loop = handler
    if (loop == null) {
      if (gen != generation) recycleQuietly(buffer)
      else copyInFlight.set(false)
      return
    }
    loop.post {
      try {
        if (ok && running.get() && gen == generation) {
          publish(buffer)
        }
      } finally {
        if (gen != generation) recycleQuietly(buffer)
        else copyInFlight.set(false)
      }
    }
  }

  private fun publish(buffer: Bitmap) {
    val jpeg = encode(buffer) ?: return
    ScreenShareBridge.emitFrame(jpeg, "inAppShareFrame")
  }

  private fun targetSize(srcW: Int, srcH: Int): Pair<Int, Int> {
    val width = even(minOf(MAX_WIDTH, srcW))
    val height = even((srcH * (width.toFloat() / srcW)).toInt())
    return width to height
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
    jpegBuffer.reset()
    if (!source.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, jpegBuffer)) return null
    val bytes = jpegBuffer.toByteArray()
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
    private const val FRAME_GAP_MS = 33L
    private const val JPEG_QUALITY = 55

    private fun even(value: Int): Int = (value.coerceAtLeast(2) / 2) * 2
  }
}
