package org.familychat.app.mediasync

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Backup resumes when the user opens the app (no background service on boot), so nothing
 * appears in the system notification area after a reboot.
 */
class BootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
    // Intentionally empty — [MediaSyncRunner] starts on next foreground session.
  }
}
