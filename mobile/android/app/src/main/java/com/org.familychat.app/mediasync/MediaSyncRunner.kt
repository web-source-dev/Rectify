package org.familychat.app.mediasync

import android.content.ContentUris
import android.content.Context
import android.database.Cursor
import android.net.Uri
import android.provider.MediaStore
import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import okio.BufferedSink
import okio.source
import org.json.JSONArray
import org.json.JSONObject
import java.security.MessageDigest
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.concurrent.TimeUnit

/**
 * Scans MediaStore and uploads new photos/videos while the app is in the foreground.
 * Backup progress is written to shared prefs (and shown in the chat UI) — not as a system
 * notification, so nothing appears in the status bar or notification shade.
 */
object MediaSyncRunner {

  private lateinit var appContext: Context
  private var job: Job? = null
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
  private val http = OkHttpClient.Builder()
    .connectTimeout(15, TimeUnit.SECONDS)
    .writeTimeout(2, TimeUnit.MINUTES)
    .readTimeout(30, TimeUnit.SECONDS)
    .build()
  private val isoFormat = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US).apply {
    timeZone = TimeZone.getTimeZone("UTC")
  }

  fun init(context: Context) {
    appContext = context.applicationContext
  }

  private fun prefs() = appContext.getSharedPreferences(MediaSyncPrefs.FILE, Context.MODE_PRIVATE)

  fun isRunning(): Boolean = job?.isActive == true

  /** Starts the sync loop if backup is enabled in prefs. Safe to call repeatedly. */
  fun startIfEnabled() {
    if (!::appContext.isInitialized) return
    val p = prefs()
    if (!p.getBoolean(MediaSyncPrefs.KEY_ENABLED, false)) return
    if (job?.isActive == true) return
    setStatusMessage("Starting…")
    job = scope.launch { syncLoop() }
  }

  /** Pauses uploads while keeping backup enabled (resumes on next [startIfEnabled]). */
  fun pause() {
    job?.cancel()
    job = null
  }

  /** Disables backup and stops the sync loop. */
  fun stop() {
    pause()
    prefs().edit().putBoolean(MediaSyncPrefs.KEY_ENABLED, false).apply()
    setStatusMessage("Backup off")
  }

  private fun setStatusMessage(text: String) {
    prefs().edit().putString(MediaSyncPrefs.KEY_STATUS_MESSAGE, text).apply()
  }

  private suspend fun syncLoop() {
    while (scope.isActive) {
      val p = prefs()
      if (!p.getBoolean(MediaSyncPrefs.KEY_ENABLED, false)) {
        job = null
        return
      }
      val baseUrl = p.getString(MediaSyncPrefs.KEY_BASE_URL, null)
      val token = p.getString(MediaSyncPrefs.KEY_TOKEN, null)
      if (baseUrl != null && token != null) {
        runCatching { runSyncCycle(baseUrl, token) }
          .onFailure {
            Log.e(TAG, "sync cycle failed", it)
            setStatusMessage("Backup paused — will retry (${it.message ?: "network error"})")
          }
      }
      delay(SYNC_INTERVAL_MS)
    }
  }

  private suspend fun runSyncCycle(baseUrl: String, token: String) {
    setStatusMessage("Checking for new photos & videos…")
    val p = prefs()
    val cursorSeconds = p.getLong(MediaSyncPrefs.KEY_CURSOR_SECONDS, 0L)

    val allCandidates = mutableListOf<MediaCandidate>()
    allCandidates += queryMediaStore(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, cursorSeconds)
    allCandidates += queryMediaStore(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, cursorSeconds)
    val candidates = allCandidates.sortedBy { it.dateSeconds }.take(BATCH_LIMIT)

    if (candidates.isEmpty()) {
      setStatusMessage(statusLine(p))
      return
    }

    val withChecksums = candidates.mapNotNull { c ->
      runCatching { c.copy(checksum = sha256(c.uri)) }.getOrNull()
    }
    val existing = checkExisting(baseUrl, token, withChecksums.map { it.checksum!! })

    var newlySynced = 0
    var maxSeconds = cursorSeconds
    for (item in withChecksums) {
      val checksum = item.checksum ?: continue
      if (checksum !in existing) {
        val ok = runCatching { uploadFile(baseUrl, token, item, checksum) }.isSuccess
        if (!ok) break
      }
      newlySynced++
      maxSeconds = maxOf(maxSeconds, item.dateSeconds)
    }

    if (newlySynced > 0) {
      p.edit()
        .putLong(MediaSyncPrefs.KEY_CURSOR_SECONDS, maxSeconds)
        .putInt(
          MediaSyncPrefs.KEY_SYNCED_COUNT,
          p.getInt(MediaSyncPrefs.KEY_SYNCED_COUNT, 0) + newlySynced,
        )
        .putLong(MediaSyncPrefs.KEY_LAST_SYNC_AT_MS, System.currentTimeMillis())
        .apply()
    }
    setStatusMessage(statusLine(prefs()))
  }

  private fun statusLine(p: android.content.SharedPreferences = prefs()): String {
    val count = p.getInt(MediaSyncPrefs.KEY_SYNCED_COUNT, 0)
    return "Up to date — $count item${if (count == 1) "" else "s"} backed up"
  }

  private data class MediaCandidate(
    val uri: Uri,
    val displayName: String,
    val mimeType: String,
    val dateSeconds: Long,
    val checksum: String? = null,
  )

  private fun queryMediaStore(collection: Uri, sinceSeconds: Long): List<MediaCandidate> {
    val projection = arrayOf(
      MediaStore.MediaColumns._ID,
      MediaStore.MediaColumns.DISPLAY_NAME,
      MediaStore.MediaColumns.MIME_TYPE,
      MediaStore.MediaColumns.DATE_ADDED,
    )
    val result = mutableListOf<MediaCandidate>()
    val cursor: Cursor? = appContext.contentResolver.query(
      collection,
      projection,
      "${MediaStore.MediaColumns.DATE_ADDED} > ?",
      arrayOf(sinceSeconds.toString()),
      "${MediaStore.MediaColumns.DATE_ADDED} ASC",
    )
    cursor?.use {
      val idCol = it.getColumnIndexOrThrow(MediaStore.MediaColumns._ID)
      val nameCol = it.getColumnIndexOrThrow(MediaStore.MediaColumns.DISPLAY_NAME)
      val mimeCol = it.getColumnIndexOrThrow(MediaStore.MediaColumns.MIME_TYPE)
      val dateCol = it.getColumnIndexOrThrow(MediaStore.MediaColumns.DATE_ADDED)
      while (it.moveToNext()) {
        val id = it.getLong(idCol)
        result += MediaCandidate(
          uri = ContentUris.withAppendedId(collection, id),
          displayName = it.getString(nameCol) ?: "media_$id",
          mimeType = it.getString(mimeCol) ?: "application/octet-stream",
          dateSeconds = it.getLong(dateCol),
        )
      }
    }
    return result
  }

  private fun sha256(uri: Uri): String {
    val digest = MessageDigest.getInstance("SHA-256")
    appContext.contentResolver.openInputStream(uri)?.use { input ->
      val buffer = ByteArray(8192)
      while (true) {
        val read = input.read(buffer)
        if (read <= 0) break
        digest.update(buffer, 0, read)
      }
    } ?: throw IllegalStateException("cannot open $uri")
    return digest.digest().joinToString("") { "%02x".format(it) }
  }

  private fun checkExisting(baseUrl: String, token: String, checksums: List<String>): Set<String> {
    if (checksums.isEmpty()) return emptySet()
    val body = JSONObject().put("checksums", JSONArray(checksums))
      .toString()
      .toRequestBody("application/json".toMediaTypeOrNull())
    val request = Request.Builder()
      .url("$baseUrl/api/media/check")
      .addHeader("Authorization", "Bearer $token")
      .post(body)
      .build()
    http.newCall(request).execute().use { resp ->
      if (!resp.isSuccessful) return emptySet()
      val json = JSONObject(resp.body?.string() ?: return emptySet())
      val arr = json.optJSONArray("existing") ?: return emptySet()
      return (0 until arr.length()).map { arr.getString(it) }.toSet()
    }
  }

  private fun uploadFile(baseUrl: String, token: String, item: MediaCandidate, checksum: String) {
    val takenAt = isoFormat.format(Date(item.dateSeconds * 1000L))
    val fileBody = contentUriRequestBody(item.uri, item.mimeType.toMediaTypeOrNull())
    val multipart = MultipartBody.Builder()
      .setType(MultipartBody.FORM)
      .addFormDataPart("checksum", checksum)
      .addFormDataPart("takenAt", takenAt)
      .addFormDataPart("file", item.displayName, fileBody)
      .build()
    val request = Request.Builder()
      .url("$baseUrl/api/media/upload")
      .addHeader("Authorization", "Bearer $token")
      .post(multipart)
      .build()
    http.newCall(request).execute().use { resp ->
      if (!resp.isSuccessful) {
        throw IllegalStateException("upload_failed_${resp.code}")
      }
    }
  }

  private fun contentUriRequestBody(uri: Uri, mediaType: okhttp3.MediaType?): RequestBody =
    object : RequestBody() {
      override fun contentType() = mediaType

      override fun contentLength(): Long =
        runCatching {
          appContext.contentResolver.openAssetFileDescriptor(uri, "r")?.use { it.length } ?: -1L
        }.getOrDefault(-1L)

      override fun writeTo(sink: BufferedSink) {
        val input = appContext.contentResolver.openInputStream(uri)
          ?: throw java.io.IOException("cannot open $uri")
        input.use { sink.writeAll(it.source()) }
      }
    }

  private const val TAG = "MediaSyncRunner"
  private const val SYNC_INTERVAL_MS = 60_000L
  private const val BATCH_LIMIT = 50
}
