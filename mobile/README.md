# Family Chat — Android app

Private app for a small group (2-3 family members): splash screen → embedded browser →
family PIN → set your name → group chat, plus automatic photo/video backup to your own
backend.

## What to edit before building

Everything you need to point this at your deployment lives in **`src/config.ts`**:

```ts
export const API_BASE_URL = 'https://your-server.example.com'; // your backend
export const SITE_URL = 'https://kozanandihl.meb.k12.tr/';     // embedded browser page
```

During local development against the backend running on your own machine with an Android
emulator, use `http://10.0.2.2:<port>` as `API_BASE_URL` — that's the special address the
emulator uses to reach `localhost` on the host machine. A real device on the same Wi-Fi can
use your machine's LAN IP instead. In production, point it at your VPS's HTTPS URL — see
`../backend/DEPLOY.md`.

## Run on a device or emulator (debug)

```
npm install
npx react-native run-android
```

Requires `ANDROID_HOME` set and either an emulator running or a device connected with USB
debugging enabled (`adb devices` should list it).

## Build a release APK to install on family phones

No Play Store needed — you can sideload the APK directly to 2-3 phones.

1. Generate a signing key (do this once, keep the file and passwords safe — you need the
   same key for every future update or the app won't install over the old one):
   ```
   keytool -genkeypair -v -storetype PKCS12 -keystore android/app/family-release.keystore \
     -alias familychat -keyalg RSA -keysize 2048 -validity 10000
   ```
2. Add the keystore credentials to `android/gradle.properties` (don't commit this file with
   real passwords — add it to a local, untracked properties file instead, e.g.
   `android/keystore.properties`, and load it from `app/build.gradle`), then point the
   `release` signing config at it instead of the debug keystore.
3. Build:
   ```
   cd android
   ./gradlew assembleRelease
   ```
   Output: `android/app/build/outputs/apk/release/app-release.apk`
4. Install directly: `adb install app-release.apk`, or transfer the APK file to each phone
   (e.g. via a messaging app or USB) and open it — Android will ask to allow installs from
   that source once.

## What this app actually does (share this with whoever uses it)

- Shows a loading screen, then a normal embedded web page.
- A small tap target in the corner of that page opens the family chat, gated by a shared
  family PIN.
- After the PIN, you set the name that shows next to your messages, then you're in the group
  chat — everyone with the PIN sees every message.
- The app asks for photo/video access so it can **automatically back up your photos and
  videos to the family's own server** (not any third party). Backup status (for example
  "Checking for new photos & videos…") appears **only on the chat screen inside the app** —
  nothing is posted to the Android notification shade or status bar. Revoke media permission
  in Android app settings at any time to stop backup.

## Photo/video sync — realistic expectations

- While the app is open (any screen), new photos/videos sync roughly every 60 seconds.
- When the app is fully closed or in the background, sync pauses until you open the app again.
  There is no persistent system notification.
- The chat screen header shows live backup status (checking, up to date, item count, errors).

## Project layout

- `src/config.ts` — the two values you configure per deployment.
- `src/screens/` — Splash, WebView, Pin, Name, Chat.
- `src/api.ts`, `src/storage.ts`, `src/types.ts` — backend REST client, session persistence,
  shared types (kept in sync with `../API_CONTRACT.md`).
- `src/native/MediaSync.ts` — JS bridge to the native module below.
- `android/app/src/main/java/com/org.familychat.app/mediasync/` — the Kotlin foreground
  service that does the actual media scanning/uploading, plus the boot receiver that restarts
  it after a reboot.
