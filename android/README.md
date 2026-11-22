# Shimi Native Android Companion (`/android`)

This directory contains the native **Kotlin + Android Foreground Service + Accessibility Task Engine** companion application for **Shimi**. It hosts the existing Shimi React/Vite PWA in a `WebView` with a bidirectional `@JavascriptInterface` (`window.ShimiNative`) while keeping wake-word detection, active speech recognition, offline-first command routing, multi-step Accessibility execution, TTS, and floating robot presence running independently in a native Android foreground service even when the PWA UI is minimized or swiped away from Recents.

---

## 1. Architecture Overview

- **Layer A — Existing Web/PWA UI (`/src`)**:
  - Preserves the approved visual design, `<RobotCharacter />`, styles, accessories, personality, chat console, onboarding, and customization.
  - Hydrates personalized APK defaults from `window.ShimiNative.getAssistantConfigJson()` on startup so a custom APK (e.g., `"Milo"`) opens immediately with its baked-in name, wake word, style, and accessory.
  - Provides the **Download APK** personalized builder tab and **Permissions -> Make Shimi Your Phone Assistant** setup wizard + real **Test Shimi** diagnostics.
- **Layer B — Native Android Companion (`/android`)**:
  - `service/ShimiForegroundService.kt`: Android 12–15 `FOREGROUND_SERVICE_MICROPHONE` service with persistent notification (`Listen` + `Stop`) that stays alive independently of the Activity/WebView.
  - `engine/WakeWordEngine.kt`: Pluggable offline `WakeWordProvider` architecture (`SherpaOnnxKwsProvider`, `PorcupineWakeWordProvider`, and built-in `OfflineAcousticWakeProvider` running locally on 16kHz PCM with RMS + ZCR + syllable cadence — zero cloud passive audio, zero passive `SpeechRecognizer`).
  - `engine/AssistantEngine.kt`: Strict two-stage audio pipeline:
    `PASSIVE WakeWord -> pause -> LISTENING -> speak "Yes?" -> ACTIVE SpeechRecognizer -> TaskPlanner/IntentRouter -> TaskExecutor/AndroidActionExecutor -> TTS -> resume passive`.
  - `tasks/TaskModels.kt`, `tasks/TaskPlanner.kt`, `tasks/TaskExecutor.kt`: Generic multi-step phone task engine (`OPEN_APP`, `WAIT_FOR_APP`, `FIND_UI`, `CLICK`, `TYPE`, `SCROLL`, `CONFIRM`, `VERIFY`) with mandatory confirmation gating before consequential actions (like sending messages or placing calls).
  - `actions/AppLauncher.kt`: Dynamic `PackageManager` app discovery with multi-match disambiguation (`"I found 2 matching apps: ... Which one should I open?"`).
  - `actions/AccessibilityActionExecutor.kt`: Strictly opt-in UI automation that refuses protected screens (`"I can't interact with this protected screen."`) and blocks password, OTP, PIN, CVV, banking, and biometric inputs.
  - `overlay/FloatingAssistantView.kt` & `overlay/OverlayManager.kt`: Native Canvas floating robot dynamically rendering all 5 themes, 3 robot styles (`pod`, `aero`, `deskbot`), 6 accessories, and all expressive `RobotState` animations.
  - `data/Models.kt` & `data/SettingsRepository.kt`: Versioned `AssistantConfig (schemaVersion = 2)` seeded on first launch directly from `BuildConfig.SHIMI_DEFAULT_*`.
  - `service/BootReceiver.kt`: Honest Android 14+ boot notification (`"Your assistant is ready. Tap to resume background listening."`).

---

## 2. Building a Personalized APK (GitHub Actions CI or Local Android Studio)

### Option A: Automated Cloud APK Build via GitHub Actions (`.github/workflows/build-apk.yml`)
1. Push this repository to GitHub.
2. *(Optional for signed release APKs)* Add these four **GitHub Repository Secrets** (never commit keystores to git):
   - `ANDROID_KEYSTORE_BASE64`
   - `ANDROID_KEYSTORE_PASSWORD`
   - `ANDROID_KEY_ALIAS`
   - `ANDROID_KEY_PASSWORD`
   *(If omitted, CI builds and publishes an explicitly labeled `-unsigned-debug.apk` for testing.)*
3. Configure server-side environment variables on your deployed host (`.env` / Cloud Run secrets):
   - `GITHUB_REPO=owner/repo`
   - `GITHUB_TOKEN=<PAT with actions:write and contents:read>`
   - `GITHUB_REF=main`
4. Open the **Download APK** tab in Shimi, customize name/wake word/robot style/accessory/theme, and click **Build My APK**.

### Option B: Local Build with Android Studio / Gradle (JDK 17 + Android SDK 35)
```bash
cd android
./gradlew assembleDebug \
  -PSHIMI_DEFAULT_NAME="Milo" \
  -PSHIMI_DEFAULT_WAKE_WORD="Milo" \
  -PSHIMI_DEFAULT_STYLE="aero" \
  -PSHIMI_DEFAULT_ACCESSORY="headphones" \
  -PSHIMI_DEFAULT_PERSONALITY="playful" \
  -PSHIMI_DEFAULT_THEME="sage-emerald" \
  -PSHIMI_VERSION_NAME="2.1.0" \
  -PSHIMI_VERSION_CODE=20101
```
Output launcher label automatically updates to `"Milo"` via `manifestPlaceholders["appLabel"]`.

---

## 3. Android 12 / 13 / 14 / 15 Capability Boundaries

| Feature | Android 12–13 | Android 14–15 | Shimi Behavior |
|---|---|---|---|
| Background wake-word + mic | `foregroundServiceType="microphone"` started from foreground | Strictly requires foreground start & visible notification | `ShimiForegroundService` keeps persistent notification with Listen/Stop |
| Auto-start mic after reboot | Allowed on API < 34 if mic granted | **Blocked by OS** (`BOOT_COMPLETED` cannot start mic FGS) | `BootReceiver` posts honest tap-to-resume notification |
| Floating robot over other apps | Allowed with `SYSTEM_ALERT_WINDOW` | Allowed with `SYSTEM_ALERT_WINDOW` (Restricted Settings on sideloaded APKs) | Falls back cleanly to notification controls if not granted |
| Multi-step app tasks (WhatsApp draft & confirm) | Opt-in `AccessibilityService` | Opt-in `AccessibilityService` (Android 13+ Restricted Settings) | Executes `TaskPlan` steps with confirmation gate before Send; blocks protected/password screens |
| Direct Wi-Fi / Bluetooth silent toggle | Restricted on API 29+ | Restricted on API 29+ | Opens official `Settings.ACTION_WIFI_SETTINGS` / `ACTION_BLUETOOTH_SETTINGS` |
| Passwords / Banking / Payments / OTP | Never automated | Never automated | Explicitly blocked by `AccessibilityActionExecutor` & `PrivacyManager` |
