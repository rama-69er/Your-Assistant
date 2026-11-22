# Shimi — Privacy-First Personal Android AI Assistant

Shimi is a privacy-first personal voice assistant composed of two cooperating layers:

1. **Layer A — React/Vite/Express PWA (`/src`, `/server.ts`)**: Interactive companion dashboard, `<RobotCharacter />` customization, offline-first intent router, **Permissions Setup Wizard** (`Make Shimi Your Phone Assistant` + real `Test Shimi` diagnostics), **Download APK** personalized builder, and server-side proxies for Gemini (`/api/shimi/*`) and GitHub Actions APK CI (`/api/apk/*`).
2. **Layer B — Native Android Kotlin Companion (`/android`)**: Independent `ShimiForegroundService` that stays alive when minimized or swiped away from Recents, pluggable offline `WakeWordEngine` (`SherpaOnnxKwsProvider` / `PorcupineWakeWordProvider` / `OfflineAcousticWakeProvider`), two-stage active `SpeechRecognizer` pipeline, dynamic `AppLauncher` with disambiguation, opt-in multi-step `AccessibilityService` `TaskPlanner` / `TaskExecutor` with confirmation gates, and native Canvas floating robot overlay.

> **Honest Android Capability Scope**: Shimi can perform the maximum set of actions exposed by Android's public APIs and the user-enabled `AccessibilityService`. It never claims unrestricted OS control and explicitly refuses passwords, OTPs, banking, payment confirmations, and biometric/security prompts.

---

## Quick Start (Web / Server)

```bash
npm install
npm run dev
```

Run pure logic unit tests:
```bash
npx tsx --test src/core/*.test.ts
```

## Personalized Android APK Builds (`.github/workflows/build-apk.yml`)

Because web containers do not bundle JDK 17 or the Android SDK, real installable `.apk` compilation runs via the included **GitHub Actions Android CI workflow** (`.github/workflows/build-apk.yml`).

- Configure `GITHUB_REPO`, `GITHUB_TOKEN`, and `GITHUB_REF` on the server (see `.env.example`) to enable one-click personalized builds directly from the **Download APK** tab.
- Configure `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, and `ANDROID_KEY_PASSWORD` in GitHub Repository Secrets for signed release APKs (`shimi-milo-v2.1.0.apk`). Without signing secrets, CI produces an explicitly named `-unsigned-debug.apk` for testing and never claims it is a signed release.
- See `/android/README.md` for local Android Studio/Gradle build commands, Android 12–15 boundaries, and the physical-device verification checklist.
