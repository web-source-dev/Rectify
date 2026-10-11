package org.familychat.app

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class PrivacyModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  override fun getName() = "PrivacyModule"

  @ReactMethod
  fun hideCover() {
    PrivacyGuard.hideCover()
  }
}
