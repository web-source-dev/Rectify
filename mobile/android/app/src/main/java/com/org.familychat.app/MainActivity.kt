package org.familychat.app

import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.CookieManager
import android.widget.FrameLayout
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

  private val releaseCover = Runnable {
    hideBlackCover()
    PrivacyGuard.holdCover = false
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      // Recent-apps shows the black window background instead of a snapshot.
      setRecentsScreenshotEnabled(false)
    }
    PrivacyGuard.attach(this)
    CookieManager.getInstance().setAcceptCookie(true)
  }

  override fun onUserLeaveHint() {
    PrivacyGuard.onUserLeaving(this)
    super.onUserLeaveHint()
  }

  override fun onPause() {
    // Write YouTube, Discord, and other site logins to disk before the app sleeps.
    CookieManager.getInstance().flush()
    window.decorView.removeCallbacks(releaseCover)
    // Secure only while paused, so the recent-apps card cannot capture the page
    // and screen share still works once the app is open again.
    window.setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE)
    showBlackCover()
    super.onPause()
  }

  override fun onResume() {
    super.onResume()
    window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
    if (!PrivacyGuard.holdCover) {
      PrivacyGuard.cancelBypass()
      hideBlackCover()
      return
    }
    // If the loading screen never clears the cover, don't leave the app black.
    window.decorView.postDelayed(releaseCover, 4000)
  }

  override fun onDestroy() {
    PrivacyGuard.detach(this)
    super.onDestroy()
  }

  fun showBlackCover() {
    val existing = window.decorView.findViewWithTag<View>(PRIVACY_COVER_TAG)
    if (existing != null) {
      existing.bringToFront()
      return
    }
    val cover = View(this).apply {
      setBackgroundColor(Color.BLACK)
      tag = PRIVACY_COVER_TAG
      isClickable = true
      importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS
    }
    addContentView(
      cover,
      FrameLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.MATCH_PARENT,
      ),
    )
  }

  fun hideBlackCover() {
    val cover = window.decorView.findViewWithTag<View>(PRIVACY_COVER_TAG) ?: return
    (cover.parent as? ViewGroup)?.removeView(cover)
  }

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "MobileApp"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)
}
