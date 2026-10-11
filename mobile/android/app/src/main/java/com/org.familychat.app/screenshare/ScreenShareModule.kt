package org.familychat.app.screenshare

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import org.familychat.app.PrivacyGuard

/**
 * JS bridge for a screen share the person starts from the chat.
 * Android shows its own system dialog before any pixels are captured.
 */
class ScreenShareModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName() = "ScreenShareModule"

  private var pending: Promise? = null
  private val inAppCapture = InAppCapture(reactContext)

  private val activityListener = object : ActivityEventListener {
    override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
      if (requestCode != REQUEST_CAPTURE) return
      val promise = pending
      pending = null
      if (promise == null) return
      if (resultCode != Activity.RESULT_OK || data == null) {
        promise.resolve(false)
        return
      }
      val settled = java.util.concurrent.atomic.AtomicBoolean(false)
      fun finish(ok: Boolean) {
        if (settled.compareAndSet(false, true)) promise.resolve(ok)
      }
      ScreenShareBridge.onReady = { finish(true) }
      ScreenShareBridge.onFailed = { finish(false) }
      try {
        ContextCompat.startForegroundService(
          reactApplicationContext,
          ScreenShareService.startIntent(reactApplicationContext, resultCode, data),
        )
      } catch (e: Exception) {
        ScreenShareBridge.onReady = null
        ScreenShareBridge.onFailed = null
        promise.reject("start_failed", e)
      }
    }

    override fun onNewIntent(intent: Intent) {}
  }

  init {
    ScreenShareBridge.reactContext = reactContext
    reactContext.addActivityEventListener(activityListener)
  }

  override fun invalidate() {
    inAppCapture.stop()
    pending?.resolve(false)
    pending = null
    reactApplicationContext.removeActivityEventListener(activityListener)
    super.invalidate()
  }

  @ReactMethod
  fun startInApp(promise: Promise) {
    promise.resolve(inAppCapture.start())
  }

  @ReactMethod
  fun stopInApp() {
    inAppCapture.stop()
  }

  @ReactMethod
  fun start(promise: Promise) {
    val activity = reactApplicationContext.currentActivity
    if (activity == null) {
      promise.reject("no_activity", "Open the app to share your screen")
      return
    }
    if (pending != null) {
      promise.reject("busy", "Screen share is already starting")
      return
    }
    pending = promise
    PrivacyGuard.bypassNextLeave()
    try {
      val manager = activity.getSystemService(android.content.Context.MEDIA_PROJECTION_SERVICE)
        as android.media.projection.MediaProjectionManager
      activity.startActivityForResult(manager.createScreenCaptureIntent(), REQUEST_CAPTURE)
    } catch (e: Exception) {
      pending = null
      PrivacyGuard.cancelBypass()
      promise.reject("screen_share_failed", e)
    }
  }

  @ReactMethod
  fun stop() {
    if (!ScreenShareService.running) return
    try {
      reactApplicationContext.startService(
        Intent(reactApplicationContext, ScreenShareService::class.java).apply {
          action = ScreenShareService.ACTION_STOP
        },
      )
    } catch (_: Exception) {
      // The session is already gone.
    }
  }

  @ReactMethod
  fun setCompact(enabled: Boolean) {
    if (!ScreenShareService.running) return
    val action = if (enabled) ScreenShareService.ACTION_SHOW_BUBBLE else ScreenShareService.ACTION_HIDE_BUBBLE
    try {
      reactApplicationContext.startService(
        Intent(reactApplicationContext, ScreenShareService::class.java).apply { this.action = action },
      )
    } catch (_: Exception) {
      // The share session is not running, or the app is not allowed to start it from the background.
    }
  }

  @ReactMethod
  fun canDrawOverlay(promise: Promise) {
    promise.resolve(Settings.canDrawOverlays(reactApplicationContext))
  }

  @ReactMethod
  fun openOverlaySettings() {
    val intent = Intent(
      Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
      Uri.parse("package:${reactApplicationContext.packageName}"),
    )
    val activity = reactApplicationContext.currentActivity
    if (activity != null) {
      activity.startActivity(intent)
    } else {
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      reactApplicationContext.startActivity(intent)
    }
  }

  @ReactMethod
  fun addListener(eventName: String) {}

  @ReactMethod
  fun removeListeners(count: Int) {}

  companion object {
    private const val REQUEST_CAPTURE = 4812
  }
}
