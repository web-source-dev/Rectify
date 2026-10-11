package org.familychat.app

import com.facebook.react.ReactApplication
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.lang.ref.WeakReference

/**
 * Hides the app in the recent-apps list and tells JavaScript to replay the
 * loading screen plus PIN when the person left on purpose (Home or recents).
 * Gallery and screen-share dialogs call [bypassNextLeave] so those do not lock.
 */
object PrivacyGuard {
  private var activityRef: WeakReference<MainActivity>? = null
  private var bypassNext = false

  @Volatile
  var holdCover = false

  fun attach(activity: MainActivity) {
    activityRef = WeakReference(activity)
  }

  fun detach(activity: MainActivity) {
    if (activityRef?.get() === activity) {
      activityRef = null
    }
  }

  fun bypassNextLeave() {
    bypassNext = true
  }

  fun cancelBypass() {
    bypassNext = false
  }

  fun onUserLeaving(activity: MainActivity) {
    if (bypassNext) {
      bypassNext = false
      return
    }
    holdCover = true
    activity.showBlackCover()
    val reactContext = (activity.application as? ReactApplication)
      ?.reactNativeHost
      ?.reactInstanceManager
      ?.currentReactContext ?: return
    reactContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit("userLeftApp", null)
  }

  fun hideCover() {
    holdCover = false
    val activity = activityRef?.get() ?: return
    activity.runOnUiThread { activity.hideBlackCover() }
  }
}

const val PRIVACY_COVER_TAG = "privacy-cover"
