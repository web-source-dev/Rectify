package org.familychat.app.screenshare

import android.util.Base64
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * Hands capture frames and stop events to the signed-in chat UI.
 * Capture itself only starts after the system screen-share dialog.
 */
object ScreenShareBridge {
  @Volatile
  var reactContext: ReactApplicationContext? = null

  @Volatile
  var onReady: (() -> Unit)? = null

  @Volatile
  var onFailed: (() -> Unit)? = null

  fun signalReady() {
    val ready = onReady
    onReady = null
    onFailed = null
    ready?.invoke()
  }

  fun signalFailed() {
    val failed = onFailed
    onReady = null
    onFailed = null
    failed?.invoke()
  }

  fun emitFrame(jpeg: ByteArray) {
    val ctx = reactContext ?: return
    val payload = Arguments.createMap().apply {
      putString("frame", Base64.encodeToString(jpeg, Base64.NO_WRAP))
    }
    emit(ctx, "screenShareFrame", payload)
  }

  fun emitStopped() {
    val ctx = reactContext ?: return
    emit(ctx, "screenShareStopped", null)
  }

  private fun emit(ctx: ReactApplicationContext, name: String, payload: Any?) {
    try {
      ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        .emit(name, payload)
    } catch (_: Exception) {
      // JS runtime is already gone; the notification Stop action still ends capture.
    }
  }
}
