# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# Add any project specific keep options here:

# --- App-specific keep rules (added for the minified release build) ---

# Native in-app media backup module is referenced from Kotlin/RN by name.
-keep class org.familychat.app.mediasync.** { *; }

# OkHttp / Okio ship their own consumer rules, but silence optional-dependency
# warnings so the minified release build doesn't fail on them.
-dontwarn okhttp3.**
-dontwarn okio.**
-dontwarn org.conscrypt.**
-dontwarn org.bouncycastle.**
-dontwarn org.openjsse.**
