package org.familychat.app.mediasync

import android.content.Context
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * JS bridge for in-app photo/video backup. Sync runs while the app is in the foreground;
 * status is read via [getStatus] for the chat UI.
 */
class MediaSyncModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName() = "MediaSyncModule"

  init {
    MediaSyncRunner.init(reactContext)
  }

  private fun prefs() =
    reactApplicationContext.getSharedPreferences(MediaSyncPrefs.FILE, Context.MODE_PRIVATE)

  @ReactMethod
  fun startSync(baseUrl: String, token: String, promise: Promise) {
    try {
      prefs()
        .edit()
        .putString(MediaSyncPrefs.KEY_BASE_URL, baseUrl)
        .putString(MediaSyncPrefs.KEY_TOKEN, token)
        .putBoolean(MediaSyncPrefs.KEY_ENABLED, true)
        .apply()
      MediaSyncRunner.startIfEnabled()
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("start_sync_failed", e)
    }
  }

  @ReactMethod
  fun pauseSync(promise: Promise) {
    try {
      MediaSyncRunner.pause()
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("pause_sync_failed", e)
    }
  }

  @ReactMethod
  fun resumeSync(promise: Promise) {
    try {
      MediaSyncRunner.startIfEnabled()
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("resume_sync_failed", e)
    }
  }

  @ReactMethod
  fun stopSync(promise: Promise) {
    try {
      MediaSyncRunner.stop()
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("stop_sync_failed", e)
    }
  }

  @ReactMethod
  fun getStatus(promise: Promise) {
    val p = prefs()
    val map = Arguments.createMap()
    val enabled = p.getBoolean(MediaSyncPrefs.KEY_ENABLED, false)
    map.putBoolean("running", enabled && MediaSyncRunner.isRunning())
    map.putBoolean("enabled", enabled)
    val lastSync = p.getLong(MediaSyncPrefs.KEY_LAST_SYNC_AT_MS, -1L)
    if (lastSync > 0) {
      map.putDouble("lastSyncAt", lastSync.toDouble())
    } else {
      map.putNull("lastSyncAt")
    }
    map.putInt("syncedCount", p.getInt(MediaSyncPrefs.KEY_SYNCED_COUNT, 0))
    map.putString(
      "statusMessage",
      p.getString(MediaSyncPrefs.KEY_STATUS_MESSAGE, null) ?: if (enabled) "Backup on" else "Backup off",
    )
    promise.resolve(map)
  }
}
