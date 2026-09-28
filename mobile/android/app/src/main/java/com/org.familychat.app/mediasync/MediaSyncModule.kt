package org.familychat.app.mediasync

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.OpenableColumns
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * JS bridge for in-app photo/video backup. Sync runs while the app is in the foreground;
 * status is read via [getStatus] for the chat UI. Also exposes [pickImage] so the chat
 * can send a photo from the gallery.
 */
class MediaSyncModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName() = "MediaSyncModule"

  private var pickPromise: Promise? = null

  private val activityListener = object : ActivityEventListener {
    override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
      if (requestCode != PICK_IMAGE_REQUEST) return
      val promise = pickPromise ?: return
      pickPromise = null
      val uri = data?.data
      if (resultCode != Activity.RESULT_OK || uri == null) {
        promise.resolve(null)
        return
      }
      try {
        promise.resolve(describePickedFile(uri))
      } catch (e: Exception) {
        promise.reject("pick_image_failed", e)
      }
    }

    override fun onNewIntent(intent: Intent) {}
  }

  init {
    MediaSyncRunner.init(reactContext)
    reactContext.addActivityEventListener(activityListener)
  }

  private fun describePickedFile(uri: Uri) = Arguments.createMap().apply {
    val resolver = reactApplicationContext.contentResolver
    var name: String? = null
    var size = -1L
    resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)
      ?.use { c ->
        if (c.moveToFirst()) {
          name = c.getString(0)
          if (!c.isNull(1)) size = c.getLong(1)
        }
      }
    putString("uri", uri.toString())
    putString("mimeType", resolver.getType(uri) ?: "image/jpeg")
    putString("fileName", name ?: "photo.jpg")
    putDouble("size", size.toDouble())
  }

  /** Opens the system gallery; resolves `{ uri, mimeType, fileName, size }` or null if cancelled. */
  @ReactMethod
  fun pickImage(promise: Promise) {
    val activity = reactApplicationContext.currentActivity
    if (activity == null) {
      promise.reject("no_activity", "No foreground activity")
      return
    }
    if (pickPromise != null) {
      promise.reject("pick_in_progress", "A picker is already open")
      return
    }
    pickPromise = promise
    try {
      val intent = Intent(Intent.ACTION_GET_CONTENT).apply {
        type = "image/*"
        addCategory(Intent.CATEGORY_OPENABLE)
      }
      activity.startActivityForResult(Intent.createChooser(intent, "Choose a photo"), PICK_IMAGE_REQUEST)
    } catch (e: Exception) {
      pickPromise = null
      promise.reject("pick_image_failed", e)
    }
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

  companion object {
    private const val PICK_IMAGE_REQUEST = 4811
  }
}
