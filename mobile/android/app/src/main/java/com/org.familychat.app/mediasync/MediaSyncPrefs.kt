package org.familychat.app.mediasync

/** Shared preference keys used by the JS module, [MediaSyncRunner], and the boot receiver. */
object MediaSyncPrefs {
  const val FILE = "media_sync_prefs"
  const val KEY_BASE_URL = "base_url"
  const val KEY_TOKEN = "token"
  const val KEY_ENABLED = "enabled"
  // MediaStore DATE_ADDED/DATE_MODIFIED are in epoch seconds.
  const val KEY_CURSOR_SECONDS = "cursor_seconds"
  const val KEY_SYNCED_COUNT = "synced_count"
  const val KEY_LAST_SYNC_AT_MS = "last_sync_at_ms"
  /** Human-readable backup state shown in the chat screen (not in the system notification shade). */
  const val KEY_STATUS_MESSAGE = "status_message"
}
