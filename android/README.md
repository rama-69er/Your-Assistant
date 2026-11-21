# Shimi Native Android Companion (`/android`)

This directory contains the real, modular **Kotlin + Jetpack Compose / Material 3 + Android Foreground Service** companion application for **Shimi**. It hosts the existing Shimi React/Vite PWA in a `WebView` with a bidirectional `@JavascriptInterface` (`window.ShimiNative`) while keeping wake-word listening, speech recognition, offline-first command execution, TTS, and floating presence running independently in a native Android foreground service even when the PWA UI is minimized or closed.

---

## 1. Architecture Overview

- **Layer A — Existing Web/PWA UI (`/src`)**:
  - Preserves the existing visual design, `RobotCharacter` animations, chat console, onboarding, and customization.
  - Runs the Offline-First Command Router (`src/core/intentRouter.ts`) and connects to `window.ShimiNative` (`src/services/nativeBridge.ts`).
- **Layer B — Native Android Companion (`/android`)**:
  - `service/ShimiForegroundService.kt`: Android 12–15 `FOREGROUND_SERVICE_MICROPHONE` service with persistent notification (`Listen` + `Stop`).
  - `engine/WakeWordEngine.kt`: Local energy-gated VAD + offline-preferring custom wake-word detector (zero background cloud audio streaming).
  - `engine/SpeechEngine.kt` & `engine/TTSManager.kt`: Native Android `SpeechRecognizer` (`EXTRA_PREFER_OFFLINE`) and `TextToSpeech`.
  - `engine/LocalCommandEngine.kt` & `engine/IntentRouter.kt`: Deterministic offline execution for flashlight, volume, media, alarms, timers, camera, settings, app launching, dialer, contacts, calendar, and accessibility actions.
  - `engine/GeminiManager.kt`: Calls server-side `/api/shimi/interpret` only for open-ended queries when online (never embeds `GEMINI_API_KEY` in the APK).
  - `actions/AppLauncher.kt` & `actions/DeviceControlManager.kt`: Dynamic `PackageManager` app discovery + real system APIs.
  - `actions/ShimiAccessibilityService.kt` & `actions/AccessibilityActionExecutor.kt`: Strictly opt-in UI scrolling, back/home/recents, and visible-label clicking with password/security-screen protection.
  - `actions/ShimiNotificationListenerService.kt`: Strictly opt-in latest notification reader.
  - `overlay/OverlayManager.kt` & `overlay/FloatingAssistantView.kt`: Draggable `SYSTEM_ALERT_WINDOW` presence with configurable size & opacity.
  - `service/BootReceiver.kt`: Honest Android 14+ boot notification (`Tap to resume microphone listening`).

---

## 2. How to Build & Run on an Android Phone

1. Open the `/android` folder in **Android Studio Ladybug (2024.2+)** with **JDK 17** and **Android SDK 35**.
2. Point `SHIMI_PWA_URL` and `SHIMI_API_BASE_URL` in `/android/gradle.properties` to your deployed Shimi server URL (or `http://10.0.2.2:3000` for Android Emulator / LAN IP `http://<your-mac-ip>:3000` for a physical phone).
3. Run `./gradlew assembleDebug` (or click **Run** in Android Studio) to install the APK on an Android 12–15 device.
4. In Shimi → **Permissions**, grant **Microphone**, **Notifications**, and optionally **Overlay**, **Accessibility**, **Notification Access**, **Contacts**, and **Battery Optimization exemption**.
5. In Shimi → **Privacy**, switch **Shimi Background Assistant** ON and customize your wake word (e.g., your pet's name).

---

## 3. Android 12 / 13 / 14 / 15 Capability Boundaries

| Feature | Android 12–13 | Android 14–15 | Shimi Behavior |
|---|---|---|---|
| Background wake-word + mic | Allowed with `foregroundServiceType="microphone"` started from foreground | Strictly requires foreground start & visible notification | `ShimiForegroundService` displays persistent notification with Pause/Stop |
| Auto-start mic after reboot | Allowed on API < 34 if mic granted | **Blocked by OS** (`BOOT_COMPLETED` cannot start mic FGS) | `BootReceiver` posts honest tap-to-resume notification |
| Floating robot over other apps | Allowed with `SYSTEM_ALERT_WINDOW` | Allowed with `SYSTEM_ALERT_WINDOW` (restricted settings on sideloaded APKs) | Falls back cleanly to notification controls if not granted |
| Background Activity Launch (BAL) | Restricted unless overlay/visible | Tightened BAL enforcement | Uses overlay/notification/foreground context; reports honest error if OS blocks |
| Screen scroll / tap / WhatsApp assist | Opt-in `AccessibilityService` | Opt-in `AccessibilityService` (Android 13+ Restricted Settings) | Explicit disclosure + confirmation gate before sending; blocks password/security screens |
| Direct Wi-Fi / Bluetooth silent toggle | Restricted on API 29+ | Restricted on API 29+ | Opens official `Settings.ACTION_WIFI_SETTINGS` / `ACTION_BLUETOOTH_SETTINGS` |
| Passwords / Banking / Payments / OTP | Never automated | Never automated | Explicitly refused by `PrivacyManager` & `ShimiAccessibilityService` |

---

## 4. 25-Point Physical Android Device Test Checklist

1. Fresh install & onboarding saves custom assistant name and wake word locally.
2. Grant Microphone + Notifications runtime permissions from Permissions tab.
3. Enable **Shimi Background Assistant** master switch → persistent notification appears.
4. Minimize app (Home button) → notification stays alive and wake word remains active.
5. Swipe app away from Recents → `ShimiForegroundService` remains alive; reopening app reconnects to live state.
6. Say custom wake word (e.g. pet's name) → Shimi wakes up, listens, and executes command.
7. Enable **Airplane Mode / Offline** → say `"Turn on flashlight"` → torch turns on locally (zero Gemini call).
8. Offline: `"Turn off flashlight"` → torch turns off locally.
9. Offline: `"Volume up"` / `"Volume down"` / `"Mute"` → Android volume slider responds.
10. Offline: `"Set a timer for 10 minutes"` → Clock timer launches.
11. Offline: `"Set an alarm for 7 AM"` → Clock alarm launches.
12. Offline: `"Open YouTube"` → `AppLauncher` launches YouTube dynamically.
13. Offline: `"Open Wi-Fi settings"` → Android Wi-Fi settings open.
14. Offline: `"Open Bluetooth settings"` → Android Bluetooth settings open.
15. Offline: `"Open camera"` → Android Camera intent opens.
16. Say `"Call Rahul"` → confirmation gate appears; Cancel aborts; Confirm opens dialer.
17. Say `"Open WhatsApp and send a message to Alex saying hello"` → confirmation gate appears before opening draft.
18. Enable Accessibility Service → `"Scroll down"`, `"Go back"`, `"Go home"`, `"Click Settings"` execute cleanly.
19. Verify Accessibility Service refuses password / permission / biometric screens.
20. Enable Notification Access → `"Read my latest notification"` reads latest non-ongoing notification aloud.
21. Enable Overlay permission → draggable floating Shimi appears over other apps; Size & Opacity sliders update it live.
22. Enable **Offline Only** AI mode → open-ended question returns honest offline fallback without network traffic.
23. Re-enable **Auto (Offline-First + Gemini)** online → open-ended question answers via `/api/shimi/interpret` and speaks via TTS.
24. Turn **Shimi Background Assistant** master switch OFF → wake word stops, mic releases, overlay hides, notification disappears.
25. Reboot Android 14/15 device → `BootReceiver` posts honest `"Shimi is inactive after reboot — tap to resume"` notification.
