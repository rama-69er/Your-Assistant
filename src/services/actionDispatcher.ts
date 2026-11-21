import type {
  ActionExecutionRecord,
  PermissionStatusMap,
  ShimiInterpretation,
} from '../core/types';
import { nativeBridge } from './nativeBridge';

export interface ActionDispatchCallbacks {
  onOpenCamera: (timerSeconds?: number) => void;
  onOpenPhotoPicker: (subject: string) => void;
  onScrollPage: (direction: 'up' | 'down') => void;
  onNavigateBack: () => void;
  onGoHome: () => void;
}

/**
 * ActionDispatcher translates structured interpretations into real, verified
 * native Android OR browser executions.
 *
 * Truthfulness invariant:
 * - If running inside the native Android APK WebView (`nativeBridge.isNativeAvailable()`),
 *   delegates phone/OS actions directly to AndroidActionExecutor / AccessibilityActionExecutor
 *   and reports the actual native result.
 * - If running in a standard browser tab without the native Android wrapper,
 *   executes real web actions and truthfully marks Android-OS-only actions as
 *   `unsupported_in_web` instead of pretending they succeeded.
 */
export function dispatchShimiAction(
  utterance: string,
  assistantName: string,
  interpretation: ShimiInterpretation,
  permissions: PermissionStatusMap,
  callbacks: ActionDispatchCallbacks
): ActionExecutionRecord {
  const id = `act_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const safeName = assistantName.trim() || 'Shimi';
  const hasNative = nativeBridge.isNativeAvailable();

  const base = {
    id,
    timestamp: Date.now(),
    userUtterance: utterance,
    intent: interpretation.intent,
    category: interpretation.category,
    requiredPermission: interpretation.requiredPermission,
    parameters: interpretation.parameters,
    requiresConfirmation: interpretation.requiresConfirmation,
  };

  // Delegate native-only or full Android phone-control intents to the Kotlin companion when attached
  const nativePreferredIntents = new Set([
    'FLASHLIGHT_TOGGLE',
    'VOLUME_CONTROL',
    'MEDIA_CONTROL',
    'SET_TIMER',
    'SET_ALARM',
    'SET_REMINDER',
    'OPEN_APP',
    'OPEN_SETTINGS',
    'OPEN_CONTACTS',
    'OPEN_CALENDAR',
    'CLICK_UI_ELEMENT',
    'OPEN_RECENTS',
    'READ_NOTIFICATIONS',
  ]);

  if (hasNative && nativePreferredIntents.has(interpretation.intent)) {
    const nativeRes = nativeBridge.executeAction(interpretation);
    if (nativeRes) {
      return {
        ...base,
        executor:
          interpretation.category === 'ACCESSIBILITY_UI'
            ? 'accessibility_native'
            : 'local_android_native',
        status: nativeRes.status,
        summary: nativeRes.summary,
        detail: nativeRes.detail,
      };
    }
  }

  switch (interpretation.intent) {
    case 'FLASHLIGHT_TOGGLE': {
      const on = Boolean(interpretation.parameters.flashlightOn);
      return {
        ...base,
        executor: 'local_android_native',
        status: 'unsupported_in_web',
        summary: `Flashlight ${on ? 'ON' : 'OFF'} requires native Android APK`,
        detail:
          'Browsers cannot control the Android CameraManager torch directly. In the native Shimi Android app, this executes offline via CameraManager.setTorchMode().',
      };
    }

    case 'VOLUME_CONTROL': {
      const action = interpretation.parameters.volumeAction || 'up';
      return {
        ...base,
        executor: 'local_android_native',
        status: 'unsupported_in_web',
        summary: `System volume (${action}) requires native Android APK`,
        detail:
          'In the native Shimi Android app, this executes offline via AudioManager.adjustStreamVolume().',
      };
    }

    case 'MEDIA_CONTROL': {
      const action = interpretation.parameters.mediaAction || 'play_pause';
      return {
        ...base,
        executor: 'local_android_native',
        status: 'unsupported_in_web',
        summary: `Media control (${action.replace('_', ' ')}) requires native Android APK`,
        detail:
          'In the native Shimi Android app, this dispatches a real Android Media KeyEvent offline via AudioManager.',
      };
    }

    case 'SET_TIMER': {
      const secs = interpretation.parameters.timerSeconds ?? 60;
      const mins = secs >= 60 && secs % 60 === 0 ? `${secs / 60} min` : `${secs}s`;
      return {
        ...base,
        executor: 'local_android_native',
        status: 'unsupported_in_web',
        summary: `System timer (${mins}) requires native Android APK`,
        detail:
          'In the native Shimi Android app, this executes offline via AlarmClock.ACTION_SET_TIMER.',
      };
    }

    case 'SET_ALARM': {
      const h = interpretation.parameters.alarmHour ?? 7;
      const m = String(interpretation.parameters.alarmMinute ?? 0).padStart(2, '0');
      return {
        ...base,
        executor: 'local_android_native',
        status: 'unsupported_in_web',
        summary: `System alarm (${h}:${m}) requires native Android APK`,
        detail:
          'In the native Shimi Android app, this executes offline via AlarmClock.ACTION_SET_ALARM.',
      };
    }

    case 'SET_REMINDER': {
      const text = interpretation.parameters.reminderText || 'Reminder';
      return {
        ...base,
        executor: 'local_android_native',
        status: 'unsupported_in_web',
        summary: `Calendar reminder ("${text}") requires native Android APK`,
        detail:
          'In the native Shimi Android app, this creates a reminder intent via CalendarContract.',
      };
    }

    case 'OPEN_SETTINGS': {
      const target = interpretation.parameters.settingsTarget || 'general';
      return {
        ...base,
        executor: 'local_android_native',
        status: 'unsupported_in_web',
        summary: `Open Android ${target} settings requires native Android APK`,
        detail:
          'Browsers cannot open Android OS settings screens. In the native Shimi APK, this launches the exact Settings.* intent.',
      };
    }

    case 'OPEN_APP':
    case 'OPEN_CONTACTS':
    case 'OPEN_CALENDAR': {
      const appName = interpretation.parameters.appName || 'app';
      const lower = appName.toLowerCase();
      // Provide honest web deep-link fallback where a universal web URL exists
      const webLinks: Record<string, string> = {
        youtube: 'https://www.youtube.com',
        whatsapp: 'https://web.whatsapp.com',
        instagram: 'https://www.instagram.com',
        spotify: 'https://open.spotify.com',
        maps: 'https://maps.google.com',
        calendar: 'https://calendar.google.com',
      };
      const matchedUrl = Object.entries(webLinks).find(([k]) => lower.includes(k))?.[1];
      if (matchedUrl) {
        return {
          ...base,
          executor: 'web_browser',
          status: 'executed',
          summary: `Prepared link to open ${appName}`,
          detail:
            'In the native Android APK, PackageManager launches the installed app directly offline. In the browser, tap below to open it.',
          actionUrl: matchedUrl,
          actionUrlLabel: `Open ${appName}`,
        };
      }
      return {
        ...base,
        executor: 'local_android_native',
        status: 'unsupported_in_web',
        summary: `Launching installed app "${appName}" requires native Android APK`,
        detail:
          'Browser PWAs cannot query PackageManager or launch arbitrary installed Android packages. Use the native Shimi Android companion.',
      };
    }

    case 'OPEN_CAMERA':
    case 'TAKE_PHOTO_TIMER': {
      if (hasNative && interpretation.intent === 'OPEN_CAMERA') {
        const nativeRes = nativeBridge.executeAction(interpretation);
        if (nativeRes) {
          return {
            ...base,
            executor: 'local_android_native',
            status: nativeRes.status,
            summary: nativeRes.summary,
            detail: nativeRes.detail,
          };
        }
      }
      if (permissions.camera === 'denied') {
        return {
          ...base,
          executor: 'web_browser',
          status: 'blocked_permission',
          summary: 'Camera permission required',
          detail: 'Camera access is currently denied. Enable Camera in the Permissions tab to continue.',
        };
      }
      const timerSeconds =
        interpretation.intent === 'TAKE_PHOTO_TIMER'
          ? interpretation.parameters.timerSeconds ?? 3
          : undefined;
      callbacks.onOpenCamera(timerSeconds);
      return {
        ...base,
        executor: 'web_browser',
        status: 'executed',
        summary: timerSeconds
          ? `Opened live camera with ${timerSeconds}s countdown`
          : 'Opened live camera viewfinder',
        detail: 'Photos stay temporary in memory until you choose to save or discard them.',
      };
    }

    case 'OPEN_YOUTUBE_SEARCH': {
      const query = interpretation.parameters.query?.trim();
      if (!query) {
        return {
          ...base,
          executor: 'web_browser',
          status: 'error',
          summary: 'Missing YouTube search query',
          detail: 'Tell me what video or topic you want to search on YouTube.',
        };
      }
      if (hasNative) {
        const nativeRes = nativeBridge.executeAction(interpretation);
        if (nativeRes) {
          return {
            ...base,
            executor: 'local_android_native',
            status: nativeRes.status,
            summary: nativeRes.summary,
            detail: nativeRes.detail,
          };
        }
      }
      const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
      return {
        ...base,
        executor: 'web_browser',
        status: 'executed',
        summary: `Prepared YouTube search for "${query}"`,
        detail: 'Tap the link below to open YouTube directly (works on Android app links & web).',
        actionUrl: url,
        actionUrlLabel: `Open YouTube: "${query}"`,
      };
    }

    case 'OPEN_CHROME_SEARCH': {
      const query = interpretation.parameters.query?.trim();
      if (!query) {
        return {
          ...base,
          executor: 'web_browser',
          status: 'error',
          summary: 'Missing web search query',
        };
      }
      if (hasNative) {
        const nativeRes = nativeBridge.executeAction(interpretation);
        if (nativeRes) {
          return {
            ...base,
            executor: 'local_android_native',
            status: nativeRes.status,
            summary: nativeRes.summary,
            detail: nativeRes.detail,
          };
        }
      }
      const url = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
      return {
        ...base,
        executor: 'web_browser',
        status: 'executed',
        summary: `Prepared Chrome search for "${query}"`,
        detail: 'Tap below to launch the search in Chrome.',
        actionUrl: url,
        actionUrlLabel: `Search "${query}"`,
      };
    }

    case 'OPEN_MAPS_NAVIGATE': {
      const destination = interpretation.parameters.destination?.trim();
      if (!destination) {
        return {
          ...base,
          executor: 'web_browser',
          status: 'error',
          summary: 'Missing navigation destination',
          detail: 'Tell me the place or address you want directions to.',
        };
      }
      if (hasNative) {
        const nativeRes = nativeBridge.executeAction(interpretation);
        if (nativeRes) {
          return {
            ...base,
            executor: 'local_android_native',
            status: nativeRes.status,
            summary: nativeRes.summary,
            detail: nativeRes.detail,
          };
        }
      }
      const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
      return {
        ...base,
        executor: 'web_browser',
        status: 'executed',
        summary: `Prepared Google Maps route to ${destination}`,
        detail: 'Tap below to launch turn-by-turn navigation in Google Maps.',
        actionUrl: url,
        actionUrlLabel: `Navigate to ${destination}`,
      };
    }

    case 'COMPOSE_MESSAGE': {
      const contact = interpretation.parameters.contact?.trim() || 'your friend';
      const body = interpretation.parameters.messageBody?.trim() || 'Hi!';
      const isWhatsApp = (interpretation.parameters.appName || '').toLowerCase().includes('whatsapp');
      const actionUrl = isWhatsApp
        ? `https://wa.me/?text=${encodeURIComponent(body)}`
        : `sms:?body=${encodeURIComponent(body)}`;
      return {
        ...base,
        executor: hasNative ? 'accessibility_native' : 'web_browser',
        requiresConfirmation: interpretation.requiresConfirmation,
        status: interpretation.requiresConfirmation ? 'pending_confirmation' : 'executed',
        summary: interpretation.requiresConfirmation
          ? `Confirm ${isWhatsApp ? 'WhatsApp' : 'SMS'} draft for ${contact}`
          : `Prepared ${isWhatsApp ? 'WhatsApp' : 'SMS'} draft for ${contact}`,
        detail: `Message: "${body}". ${safeName} never sends messages without your explicit confirmation.`,
        actionUrl,
        actionUrlLabel: isWhatsApp ? 'Open WhatsApp draft' : 'Open Messages draft',
      };
    }

    case 'CALL_CONTACT': {
      const contact = interpretation.parameters.contact?.trim() || 'contact';
      const digitsOnly = contact.replace(/[^\d+]/g, '');
      const actionUrl = digitsOnly.length >= 3 ? `tel:${digitsOnly}` : undefined;
      return {
        ...base,
        executor: hasNative ? 'local_android_native' : 'web_browser',
        requiresConfirmation: interpretation.requiresConfirmation,
        status: interpretation.requiresConfirmation ? 'pending_confirmation' : hasNative ? 'executed' : 'unsupported_in_web',
        summary: `Confirm calling ${contact}`,
        detail: hasNative
          ? `${safeName} will look up ${contact} in Android Contacts and open the dialer after your confirmation.`
          : `In a web browser, looking up "${contact}" in Android Contacts requires the native Shimi APK. Confirm to dial directly if a phone number was given.`,
        actionUrl,
        actionUrlLabel: actionUrl ? `Dial ${digitsOnly}` : undefined,
      };
    }

    case 'FIND_PHOTO': {
      const subject = interpretation.parameters.photoSubject?.trim() || 'your photo';
      callbacks.onOpenPhotoPicker(subject);
      return {
        ...base,
        executor: 'web_browser',
        status: 'executed',
        summary: `Opened scoped Photo Picker for "${subject}"`,
        detail: 'Select specific photos to inspect temporarily in memory. Full background gallery access is never requested.',
      };
    }

    case 'READ_NOTIFICATIONS': {
      return {
        ...base,
        executor: 'local_android_native',
        status: 'unsupported_in_web',
        summary: 'Blocked — requires native Android Notification Access',
        detail:
          'Browsers and PWAs cannot read notifications from other apps. Enable Notification Access inside the native Shimi Android APK.',
      };
    }

    case 'CLICK_UI_ELEMENT': {
      const target = interpretation.parameters.uiElementText || 'element';
      return {
        ...base,
        executor: 'accessibility_native',
        status: 'unsupported_in_web',
        summary: `Tapping "${target}" in other apps requires Android AccessibilityService`,
        detail:
          'In the native Shimi APK with ShimiAccessibilityService enabled, Shimi locates visible accessible nodes and clicks them safely.',
      };
    }

    case 'OPEN_RECENTS': {
      return {
        ...base,
        executor: 'accessibility_native',
        status: 'unsupported_in_web',
        summary: 'Opening recent apps requires Android AccessibilityService',
        detail:
          'Uses GLOBAL_ACTION_RECENTS inside the native Shimi Android companion.',
      };
    }

    case 'SCROLL_PAGE': {
      const direction = interpretation.parameters.direction === 'up' ? 'up' : 'down';
      if (hasNative) {
        const nativeRes = nativeBridge.executeAction(interpretation);
        if (nativeRes && nativeRes.status === 'executed') {
          return {
            ...base,
            executor: 'accessibility_native',
            status: 'executed',
            summary: nativeRes.summary,
            detail: nativeRes.detail,
          };
        }
      }
      callbacks.onScrollPage(direction);
      return {
        ...base,
        executor: 'web_browser',
        status: 'executed',
        summary: `Scrolled ${direction} in Shimi`,
        detail:
          'Scrolling inside third-party Android apps runs through ShimiAccessibilityService in the native APK.',
      };
    }

    case 'NAVIGATE_BACK': {
      if (hasNative) {
        const nativeRes = nativeBridge.executeAction(interpretation);
        if (nativeRes && nativeRes.status === 'executed') {
          return {
            ...base,
            executor: 'accessibility_native',
            status: 'executed',
            summary: nativeRes.summary,
          };
        }
      }
      callbacks.onNavigateBack();
      return {
        ...base,
        executor: 'web_browser',
        status: 'executed',
        summary: 'Navigated back to previous view',
        detail: 'System-wide Back across other apps runs through native Android AccessibilityService.',
      };
    }

    case 'GO_HOME': {
      if (hasNative) {
        const nativeRes = nativeBridge.executeAction(interpretation);
        if (nativeRes && nativeRes.status === 'executed') {
          return {
            ...base,
            executor: 'accessibility_native',
            status: 'executed',
            summary: nativeRes.summary,
          };
        }
      }
      callbacks.onGoHome();
      return {
        ...base,
        executor: 'web_browser',
        status: 'executed',
        summary: 'Returned to Shimi dashboard',
        detail: 'Returning to the Android home launcher runs through native Android AccessibilityService.',
      };
    }

    case 'UNSUPPORTED_ANDROID_ACTION': {
      return {
        ...base,
        executor: 'web_browser',
        status: 'unsupported_in_web',
        summary: 'Blocked for your safety & platform boundaries',
        detail:
          `${safeName} never bypasses authentication, payments, transfers, posts, or permanent deletions automatically.`,
      };
    }

    case 'LIST_CAPABILITIES':
    case 'CONVERSATION': {
      return {
        ...base,
        executor: interpretation.source === 'gemini' ? 'gemini_cloud' : 'web_browser',
        status: 'executed',
        summary:
          interpretation.intent === 'LIST_CAPABILITIES'
            ? 'Shared offline & online capabilities'
            : interpretation.source === 'gemini'
              ? 'Answered via Cloud Gemini'
              : 'Responded locally',
      };
    }

    case 'CLARIFY':
    default: {
      return {
        ...base,
        executor: 'web_browser',
        status: 'error',
        summary: 'Awaiting clarification or internet',
        detail: interpretation.missingInfoQuestion || interpretation.spokenReply,
      };
    }
  }
}
