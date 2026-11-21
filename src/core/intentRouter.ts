import type {
  CommandCategory,
  PersonalityStyle,
  PermissionStatusMap,
  SettingsTarget,
  ShimiInterpretation,
} from './types';

const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  fifteen: 15,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fortyfive: 45,
  sixty: 60,
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function stripWakePhrase(utterance: string, assistantName: string, wakeWord?: string): string {
  const trimmed = utterance.trim();
  if (!trimmed) return '';
  const candidates = Array.from(
    new Set([assistantName.trim(), wakeWord?.trim()].filter((v): v is string => Boolean(v)))
  );
  if (candidates.length === 0) candidates.push('Shimi');
  const alternation = candidates.map(escapeRegExp).join('|');
  const pattern = new RegExp(`^(?:(?:hey|hi|ok|okay|hello)\\s+)?(?:${alternation})[,:.!?\\s]+`, 'i');
  return trimmed.replace(pattern, '').trim();
}

export function extractDurationSeconds(text: string): number | undefined {
  const minDigit = text.match(/\b(\d{1,3})\s*(?:minutes?|mins?|m)\b/i);
  if (minDigit) {
    const mins = Number.parseInt(minDigit[1], 10);
    if (mins >= 1 && mins <= 180) return mins * 60;
  }
  const secDigit = text.match(/\b(\d{1,3})\s*(?:seconds?|secs?|s)\b/i);
  if (secDigit) {
    const secs = Number.parseInt(secDigit[1], 10);
    if (secs >= 1 && secs <= 3600) return secs;
  }
  const wordMin = new RegExp(`\\b(${Object.keys(NUMBER_WORDS).join('|')})\\s*(?:minutes?|mins?)\\b`, 'i');
  const wordMinMatch = text.match(wordMin);
  if (wordMinMatch) {
    return NUMBER_WORDS[wordMinMatch[1].toLowerCase()] * 60;
  }
  const wordSec = new RegExp(`\\b(${Object.keys(NUMBER_WORDS).join('|')})\\s*(?:seconds?|secs?)\\b`, 'i');
  const wordSecMatch = text.match(wordSec);
  if (wordSecMatch) {
    return NUMBER_WORDS[wordSecMatch[1].toLowerCase()];
  }
  return undefined;
}

export function extractAlarmTime(text: string): { hour: number; minute: number; formatted: string } | undefined {
  const match = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?\b/i);
  if (!match) return undefined;
  let hour = Number.parseInt(match[1], 10);
  const minute = match[2] ? Number.parseInt(match[2], 10) : 0;
  const meridiem = match[3]?.toLowerCase().replace(/\./g, '');
  if (hour > 23 || minute > 59) return undefined;
  if (meridiem === 'pm' && hour < 12) hour += 12;
  if (meridiem === 'am' && hour === 12) hour = 0;
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  const displayMin = minute.toString().padStart(2, '0');
  const suffix = hour >= 12 ? 'PM' : 'AM';
  return {
    hour,
    minute,
    formatted: minute === 0 ? `${displayHour} ${suffix}` : `${displayHour}:${displayMin} ${suffix}`,
  };
}

function toneWrap(base: string, personality: PersonalityStyle): string {
  if (personality === 'calm') {
    return base.replace(/!/g, '.');
  }
  return base;
}

export interface LocalRouteResult {
  matchedLocally: boolean;
  interpretation: ShimiInterpretation;
}

/**
 * Offline-First Deterministic Command Router.
 * Classifies phone control, apps, settings, alarms, timers, flashlight,
 * volume, media, accessibility UI actions, and safety-gated communications
 * WITHOUT ever requiring Gemini or internet access.
 *
 * Returns `matchedLocally: false` ONLY for open-ended reasoning, questions,
 * or ambiguous natural language that should be routed to Gemini when online.
 */
export function routeCommandLocally(params: {
  rawUtterance: string;
  assistantName: string;
  wakeWord?: string;
  personality: PersonalityStyle;
  permissions: PermissionStatusMap;
  confirmConsequentialActions?: boolean;
  isOnline?: boolean;
}): LocalRouteResult {
  const {
    rawUtterance,
    assistantName,
    wakeWord,
    personality,
    permissions,
    confirmConsequentialActions = true,
    isOnline = true,
  } = params;

  const cleaned = stripWakePhrase(rawUtterance, assistantName, wakeWord);
  const lower = cleaned.toLowerCase();

  // Wake-word only check (e.g. user said just "Shimi")
  const rawLower = rawUtterance.trim().toLowerCase().replace(/[.,!?]+$/g, '');
  const wakeNames = [assistantName.toLowerCase(), (wakeWord || assistantName).toLowerCase()];
  if (
    !cleaned ||
    cleaned.length < 2 ||
    wakeNames.some((w) => rawLower === w || rawLower === `hey ${w}` || rawLower === `hi ${w}`)
  ) {
    return {
      matchedLocally: true,
      interpretation: {
        spokenReply: toneWrap("I'm listening. What would you like me to do?", personality),
        robotState: 'CONFUSED',
        intent: 'CLARIFY',
        category: 'INFORMATION',
        parameters: {},
        requiresConfirmation: false,
        requiredPermission: 'none',
        missingInfoQuestion: 'What would you like me to help with?',
        source: 'local',
      },
    };
  }

  // 1. Capabilities / Help
  if (/\b(what can you do|help|capabilities|commands|who are you)\b/i.test(lower)) {
    return {
      matchedLocally: true,
      interpretation: {
        spokenReply: toneWrap(
          `I'm ${assistantName}! Offline I can open apps, toggle flashlight, adjust volume, set alarms or timers, open phone settings, control media, launch camera, and navigate. Online I also answer complex questions with Gemini.`,
          personality
        ),
        robotState: 'SPEAKING',
        intent: 'LIST_CAPABILITIES',
        category: 'INFORMATION',
        parameters: {},
        requiresConfirmation: false,
        requiredPermission: 'none',
        source: 'local',
      },
    };
  }

  // 2. Flashlight ON / OFF (Local Android CameraManager API — never needs Gemini)
  if (/\b(flashlight|torch)\b/i.test(lower)) {
    const turnOff = /\b(off|disable|stop|close)\b/i.test(lower);
    const turnOn = !turnOff;
    return {
      matchedLocally: true,
      interpretation: {
        spokenReply: turnOn ? 'Turning on the flashlight.' : 'Turning off the flashlight.',
        robotState: 'SUCCESS',
        intent: 'FLASHLIGHT_TOGGLE',
        category: 'LOCAL_ANDROID_ACTION',
        parameters: { flashlightOn: turnOn },
        requiresConfirmation: false,
        requiredPermission: 'none',
        source: 'local',
      },
    };
  }

  // 3. Volume Controls (Local Android AudioManager API)
  if (/\b(volume|sound)\b/i.test(lower) || /\b(mute|unmute)\b/i.test(lower)) {
    let volumeAction: 'up' | 'down' | 'mute' | 'unmute' = 'up';
    if (/\b(unmute)\b/i.test(lower)) volumeAction = 'unmute';
    else if (/\b(mute|silent|silence)\b/i.test(lower)) volumeAction = 'mute';
    else if (/\b(down|decrease|lower|quieter|reduce)\b/i.test(lower)) volumeAction = 'down';
    else volumeAction = 'up';

    const replyMap = {
      up: 'Increasing volume.',
      down: 'Decreasing volume.',
      mute: 'Muting media volume.',
      unmute: 'Unmuting media volume.',
    };
    return {
      matchedLocally: true,
      interpretation: {
        spokenReply: replyMap[volumeAction],
        robotState: 'SUCCESS',
        intent: 'VOLUME_CONTROL',
        category: 'LOCAL_ANDROID_ACTION',
        parameters: { volumeAction },
        requiresConfirmation: false,
        requiredPermission: 'none',
        source: 'local',
      },
    };
  }

  // 4. Media Playback Controls (Local Android AudioManager media key)
  if (/\b(play|pause|resume)\s+(?:music|media|song|track|audio)\b/i.test(lower) || /^(play|pause|play\/pause media|next song|next track|previous song|previous track)$/i.test(lower.replace(/[.,!?]+$/, ''))) {
    const mediaAction = /\b(next|skip)\b/i.test(lower)
      ? 'next'
      : /\b(previous|prev|last)\b/i.test(lower)
        ? 'previous'
        : 'play_pause';
    const reply =
      mediaAction === 'next'
        ? 'Skipping to the next track.'
        : mediaAction === 'previous'
          ? 'Going to the previous track.'
          : 'Toggling media playback.';
    return {
      matchedLocally: true,
      interpretation: {
        spokenReply: reply,
        robotState: 'SUCCESS',
        intent: 'MEDIA_CONTROL',
        category: 'LOCAL_ANDROID_ACTION',
        parameters: { mediaAction },
        requiresConfirmation: false,
        requiredPermission: 'none',
        source: 'local',
      },
    };
  }

  // 5. Timer (Local Android AlarmClock.ACTION_SET_TIMER)
  if (/\btimer\b/i.test(lower) && !/\b(photo|picture|selfie|camera)\b/i.test(lower)) {
    const timerSeconds = extractDurationSeconds(lower);
    if (!timerSeconds) {
      return {
        matchedLocally: true,
        interpretation: {
          spokenReply: 'How long should I set the timer for?',
          robotState: 'CONFUSED',
          intent: 'CLARIFY',
          category: 'LOCAL_ANDROID_ACTION',
          parameters: {},
          requiresConfirmation: false,
          requiredPermission: 'none',
          missingInfoQuestion: 'How many minutes or seconds?',
          source: 'local',
        },
      };
    }
    const label =
      timerSeconds >= 60 && timerSeconds % 60 === 0
        ? `${timerSeconds / 60} minute${timerSeconds === 60 ? '' : 's'}`
        : `${timerSeconds} seconds`;
    return {
      matchedLocally: true,
      interpretation: {
        spokenReply: `Timer set for ${label}.`,
        robotState: 'SUCCESS',
        intent: 'SET_TIMER',
        category: 'LOCAL_ANDROID_ACTION',
        parameters: { timerSeconds },
        requiresConfirmation: false,
        requiredPermission: 'none',
        source: 'local',
      },
    };
  }

  // 6. Alarm (Local Android AlarmClock.ACTION_SET_ALARM)
  if (/\balarm\b/i.test(lower)) {
    const parsedTime = extractAlarmTime(lower);
    if (!parsedTime) {
      return {
        matchedLocally: true,
        interpretation: {
          spokenReply: 'What time should I set the alarm for?',
          robotState: 'CONFUSED',
          intent: 'CLARIFY',
          category: 'LOCAL_ANDROID_ACTION',
          parameters: {},
          requiresConfirmation: false,
          requiredPermission: 'none',
          missingInfoQuestion: 'For example, 7 AM or 6:30 AM.',
          source: 'local',
        },
      };
    }
    return {
      matchedLocally: true,
      interpretation: {
        spokenReply: `Alarm set for ${parsedTime.formatted}.`,
        robotState: 'SUCCESS',
        intent: 'SET_ALARM',
        category: 'LOCAL_ANDROID_ACTION',
        parameters: {
          alarmHour: parsedTime.hour,
          alarmMinute: parsedTime.minute,
          alarmLabel: `${assistantName} alarm`,
        },
        requiresConfirmation: false,
        requiredPermission: 'none',
        source: 'local',
      },
    };
  }

  // 7. Reminder (Calendar event intent)
  if (/\bremind me\b/i.test(lower)) {
    const bodyMatch = cleaned.match(/remind me\s+(?:to\s+)?(.+?)(?:\s+at\s+(.+))?$/i);
    const reminderText = bodyMatch?.[1]?.trim() || cleaned;
    const reminderTime = bodyMatch?.[2]?.trim();
    return {
      matchedLocally: true,
      interpretation: {
        spokenReply: reminderTime
          ? `Preparing a reminder to ${reminderText} at ${reminderTime}.`
          : `Preparing a reminder to ${reminderText}.`,
        robotState: 'SUCCESS',
        intent: 'SET_REMINDER',
        category: 'LOCAL_ANDROID_ACTION',
        parameters: { reminderText, reminderTime },
        requiresConfirmation: false,
        requiredPermission: 'none',
        source: 'local',
      },
    };
  }

  // 8. Device Settings Shortcuts (Wi-Fi, Bluetooth, Battery, Display, Accessibility, Notifications, General)
  if (/\bsettings?\b/i.test(lower)) {
    let settingsTarget: SettingsTarget = 'general';
    let label = 'Settings';
    if (/\bwi-?fi\b/i.test(lower)) {
      settingsTarget = 'wifi';
      label = 'Wi-Fi settings';
    } else if (/\bbluetooth\b/i.test(lower)) {
      settingsTarget = 'bluetooth';
      label = 'Bluetooth settings';
    } else if (/\bbattery\b/i.test(lower)) {
      settingsTarget = 'battery';
      label = 'Battery settings';
    } else if (/\bdisplay|brightness|screen\b/i.test(lower)) {
      settingsTarget = 'display';
      label = 'Display settings';
    } else if (/\baccessibility\b/i.test(lower)) {
      settingsTarget = 'accessibility';
      label = 'Accessibility settings';
    } else if (/\bnotification/i.test(lower)) {
      settingsTarget = 'notifications';
      label = 'Notification settings';
    } else if (/\boverlay|draw over\b/i.test(lower)) {
      settingsTarget = 'overlay';
      label = 'Display over other apps settings';
    }

    return {
      matchedLocally: true,
      interpretation: {
        spokenReply: `Opening ${label}.`,
        robotState: 'SUCCESS',
        intent: 'OPEN_SETTINGS',
        category: 'DEVICE_SETTING',
        parameters: { settingsTarget },
        requiresConfirmation: false,
        requiredPermission: 'none',
        source: 'local',
      },
    };
  }

  // 9. Take a photo with countdown
  if (
    /\b(take a (?:picture|photo|selfie)|snap a photo|take photo|countdown)\b/i.test(lower) &&
    /\b(picture|photo|selfie|camera|snap)\b/i.test(lower)
  ) {
    const timerSeconds = extractDurationSeconds(lower) ?? 3;
    if (permissions.camera === 'denied') {
      return {
        matchedLocally: true,
        interpretation: {
          spokenReply:
            'I need camera permission before I can take a picture. Please enable Camera in Permissions.',
          robotState: 'SORRY',
          intent: 'TAKE_PHOTO_TIMER',
          category: 'LOCAL_ANDROID_ACTION',
          parameters: { timerSeconds },
          requiresConfirmation: false,
          requiredPermission: 'camera',
          source: 'local',
        },
      };
    }
    return {
      matchedLocally: true,
      interpretation: {
        spokenReply: toneWrap(
          `Getting your camera ready! I'll take a picture after ${timerSeconds} seconds.`,
          personality
        ),
        robotState: 'SUCCESS',
        intent: 'TAKE_PHOTO_TIMER',
        category: 'LOCAL_ANDROID_ACTION',
        parameters: { timerSeconds },
        requiresConfirmation: false,
        requiredPermission: 'camera',
        source: 'local',
      },
    };
  }

  // 10. Open Camera
  if (/\b(open|launch|start)\b.*\bcamera\b/i.test(lower) || lower === 'camera') {
    if (permissions.camera === 'denied') {
      return {
        matchedLocally: true,
        interpretation: {
          spokenReply:
            'I need camera permission before I can open your camera. You can enable it in the Permissions tab.',
          robotState: 'SORRY',
          intent: 'OPEN_CAMERA',
          category: 'LOCAL_ANDROID_ACTION',
          parameters: {},
          requiresConfirmation: false,
          requiredPermission: 'camera',
          source: 'local',
        },
      };
    }
    return {
      matchedLocally: true,
      interpretation: {
        spokenReply: toneWrap('Opening your camera!', personality),
        robotState: 'SUCCESS',
        intent: 'OPEN_CAMERA',
        category: 'LOCAL_ANDROID_ACTION',
        parameters: {},
        requiresConfirmation: false,
        requiredPermission: 'camera',
        source: 'local',
      },
    };
  }

  // 11. Compose Message (WhatsApp / SMS) — ALWAYS safety-confirmed when confirmConsequentialActions is true
  if (
    /\b(whatsapp|message|text|sms)\b/i.test(lower) &&
    /\b(send|write|compose|message|text)\b/i.test(lower) &&
    !/^(open|launch|start)\s+whatsapp[.!?]*$/i.test(lower)
  ) {
    const toMatch = cleaned.match(
      /\b(?:to|for)\s+([a-zA-Z0-9\s'-]{2,28}?)(?:\s+(?:saying|that|:|-)\s+(.+))?$/i
    );
    const colonMatch = cleaned.match(
      /(?:send|message|text)\s+(?!(?:a\s+)?(?:message|text|whatsapp)\s+to\b)([a-zA-Z0-9\s'-]{2,28}?)\s*(?::|saying|that)\s*(.+)$/i
    );
    const contact = (toMatch?.[1] || colonMatch?.[1] || 'your friend').trim();
    const messageBody = (toMatch?.[2] || colonMatch?.[2] || 'Hi!').trim();
    const appName = /\bwhatsapp\b/i.test(lower) ? 'WhatsApp' : 'Messages';
    return {
      matchedLocally: true,
      interpretation: {
        spokenReply: toneWrap(
          `Send this ${appName} message to ${contact}: "${messageBody}"? Please confirm before I send.`,
          personality
        ),
        robotState: 'SPEAKING',
        intent: 'COMPOSE_MESSAGE',
        category: 'COMMUNICATION',
        parameters: { contact, messageBody, appName },
        requiresConfirmation: confirmConsequentialActions,
        requiredPermission: 'none',
        source: 'local',
      },
    };
  }

  // 12. Call contact (ALWAYS safety-confirmed consequential action)
  if (/^(?:call|dial|phone)\s+(.+)$/i.test(cleaned)) {
    const contact = cleaned.replace(/^(?:call|dial|phone)\s+/i, '').replace(/[.,!?]+$/, '').trim();
    return {
      matchedLocally: true,
      interpretation: {
        spokenReply: `Call ${contact}? Please confirm before I start the call.`,
        robotState: 'SPEAKING',
        intent: 'CALL_CONTACT',
        category: 'COMMUNICATION',
        parameters: { contact },
        requiresConfirmation: confirmConsequentialActions,
        requiredPermission: 'contacts',
        source: 'local',
      },
    };
  }

  // 13. Open Contacts / Calendar
  if (/\b(open|launch|show)\s+(?:my\s+)?contacts?\b/i.test(lower)) {
    return {
      matchedLocally: true,
      interpretation: {
        spokenReply: 'Opening Contacts.',
        robotState: 'SUCCESS',
        intent: 'OPEN_CONTACTS',
        category: 'APP_LAUNCH',
        parameters: { appName: 'Contacts' },
        requiresConfirmation: false,
        requiredPermission: 'none',
        source: 'local',
      },
    };
  }
  if (/\b(open|launch|show)\s+(?:my\s+)?calendar\b/i.test(lower)) {
    return {
      matchedLocally: true,
      interpretation: {
        spokenReply: 'Opening Calendar.',
        robotState: 'SUCCESS',
        intent: 'OPEN_CALENDAR',
        category: 'APP_LAUNCH',
        parameters: { appName: 'Calendar' },
        requiresConfirmation: false,
        requiredPermission: 'none',
        source: 'local',
      },
    };
  }

  // 14. YouTube Search (or plain "Open YouTube")
  if (/\byoutube\b/i.test(lower)) {
    if (/^(?:open|launch|start)\s+youtube[.!?]*$/i.test(lower)) {
      return {
        matchedLocally: true,
        interpretation: {
          spokenReply: 'Opening YouTube.',
          robotState: 'SUCCESS',
          intent: 'OPEN_APP',
          category: 'APP_LAUNCH',
          parameters: { appName: 'YouTube', packageName: 'com.google.android.youtube' },
          requiresConfirmation: false,
          requiredPermission: 'none',
          source: 'local',
        },
      };
    }
    const queryMatch = cleaned.match(
      /(?:search(?:\s+youtube)?(?:\s+for)?|find|play|watch|look up)\s+(.+)$/i
    );
    const query = queryMatch
      ? queryMatch[1].replace(/\b(?:on|in)\s+youtube\b/gi, '').replace(/[.,!?]+$/, '').trim()
      : '';
    if (!query) {
      return {
        matchedLocally: true,
        interpretation: {
          spokenReply: toneWrap('Sure! What would you like me to search for on YouTube?', personality),
          robotState: 'CONFUSED',
          intent: 'CLARIFY',
          category: 'APP_LAUNCH',
          parameters: { appName: 'YouTube' },
          requiresConfirmation: false,
          requiredPermission: 'none',
          missingInfoQuestion: 'What should I search on YouTube?',
          source: 'local',
        },
      };
    }
    return {
      matchedLocally: true,
      interpretation: {
        spokenReply: toneWrap(`Searching YouTube for "${query}".`, personality),
        robotState: 'SUCCESS',
        intent: 'OPEN_YOUTUBE_SEARCH',
        category: 'APP_LAUNCH',
        parameters: { query, appName: 'YouTube' },
        requiresConfirmation: false,
        requiredPermission: 'none',
        source: 'local',
      },
    };
  }

  // 15. Chrome Search
  if (/\bchrome\b/i.test(lower) && /\b(search|look up)\b/i.test(lower)) {
    const queryMatch = cleaned.match(/(?:search(?:\s+for)?|look up)\s+(.+)$/i);
    const query = queryMatch ? queryMatch[1].replace(/[.,!?]+$/, '').trim() : '';
    if (query) {
      return {
        matchedLocally: true,
        interpretation: {
          spokenReply: `Searching Chrome for "${query}".`,
          robotState: 'SUCCESS',
          intent: 'OPEN_CHROME_SEARCH',
          category: 'APP_LAUNCH',
          parameters: { query, appName: 'Chrome' },
          requiresConfirmation: false,
          requiredPermission: 'none',
          source: 'local',
        },
      };
    }
  }

  // 16. Google Maps Navigation
  if (/\b(maps|navigate|directions|route to)\b/i.test(lower)) {
    const destMatch = cleaned.match(
      /(?:navigate(?:\s+to)?|directions(?:\s+to)?|route(?:\s+to)?|go to)\s+(.+)$/i
    );
    const destination = destMatch
      ? destMatch[1].replace(/\b(?:on|in|using)\s+(?:google\s+)?maps\b/gi, '').replace(/[.,!?]+$/, '').trim()
      : '';
    if (!destination || /^(?:my\s+)?destination$/i.test(destination)) {
      return {
        matchedLocally: true,
        interpretation: {
          spokenReply: toneWrap('I can prepare Google Maps navigation! Where would you like to go?', personality),
          robotState: 'CONFUSED',
          intent: 'CLARIFY',
          category: 'APP_LAUNCH',
          parameters: { appName: 'Google Maps' },
          requiresConfirmation: false,
          requiredPermission: 'none',
          missingInfoQuestion: 'Which destination should I navigate to?',
          source: 'local',
        },
      };
    }
    return {
      matchedLocally: true,
      interpretation: {
        spokenReply: toneWrap(`Preparing Google Maps navigation to ${destination}.`, personality),
        robotState: 'SUCCESS',
        intent: 'OPEN_MAPS_NAVIGATE',
        category: 'APP_LAUNCH',
        parameters: { destination, appName: 'Google Maps' },
        requiresConfirmation: false,
        requiredPermission: 'none',
        source: 'local',
      },
    };
  }

  // 17. Find Photo in Gallery (Scoped Photo Picker)
  if (/\b(gallery|photo|picture|pictures|photos)\b/i.test(lower) && /\b(find|search|show|look for)\b/i.test(lower)) {
    const subjectMatch = cleaned.match(
      /(?:picture|photo|pictures|photos)\s+of\s+([a-zA-Z0-9\s'-]+?)(?:\s+in\s+(?:my\s+)?gallery)?$/i
    );
    const photoSubject = subjectMatch ? subjectMatch[1].trim() : 'your selected subject';
    return {
      matchedLocally: true,
      interpretation: {
        spokenReply: toneWrap(
          `Opening the scoped Photo Picker so we can look for ${photoSubject} without accessing your whole gallery.`,
          personality
        ),
        robotState: 'SPEAKING',
        intent: 'FIND_PHOTO',
        category: 'LOCAL_ANDROID_ACTION',
        parameters: { photoSubject },
        requiresConfirmation: false,
        requiredPermission: 'photos',
        source: 'local',
      },
    };
  }

  // 18. Read Notifications
  if (/\bnotification/i.test(lower)) {
    const hasNativeListener = permissions.notification_listener === 'granted';
    return {
      matchedLocally: true,
      interpretation: {
        spokenReply: hasNativeListener
          ? 'Checking your latest notification.'
          : "I can't read system notifications until Shimi's Android Notification Access permission is enabled.",
        robotState: hasNativeListener ? 'SUCCESS' : 'SORRY',
        intent: 'READ_NOTIFICATIONS',
        category: 'LOCAL_ANDROID_ACTION',
        parameters: {},
        requiresConfirmation: false,
        requiredPermission: 'notification_listener',
        source: 'local',
      },
    };
  }

  // 19. Accessibility UI Actions: Click button, Scroll, Back, Home, Recents
  if (/^(?:click|tap|press)\s+(?:the\s+)?(?:button\s+)?(?:that\s+says\s+)?["']?(.+?)["']?[.!?]*$/i.test(cleaned)) {
    const match = cleaned.match(/^(?:click|tap|press)\s+(?:the\s+)?(?:button\s+)?(?:that\s+says\s+)?["']?(.+?)["']?[.!?]*$/i);
    const uiElementText = match?.[1]?.trim() || '';
    return {
      matchedLocally: true,
      interpretation: {
        spokenReply: `Attempting to tap "${uiElementText}".`,
        robotState: 'SUCCESS',
        intent: 'CLICK_UI_ELEMENT',
        category: 'ACCESSIBILITY_UI',
        parameters: { uiElementText },
        requiresConfirmation: false,
        requiredPermission: 'accessibility',
        source: 'local',
      },
    };
  }

  if (/\bscroll\s+(down|up)\b/i.test(lower)) {
    const direction = /\bscroll\s+up\b/i.test(lower) ? 'up' : 'down';
    return {
      matchedLocally: true,
      interpretation: {
        spokenReply: `Scrolling ${direction}.`,
        robotState: 'SUCCESS',
        intent: 'SCROLL_PAGE',
        category: 'ACCESSIBILITY_UI',
        parameters: { direction },
        requiresConfirmation: false,
        requiredPermission: 'none',
        source: 'local',
      },
    };
  }

  if (/^(?:go\s+back|back|previous\s+screen)[.!?]*$/i.test(lower)) {
    return {
      matchedLocally: true,
      interpretation: {
        spokenReply: 'Going back.',
        robotState: 'SUCCESS',
        intent: 'NAVIGATE_BACK',
        category: 'ACCESSIBILITY_UI',
        parameters: {},
        requiresConfirmation: false,
        requiredPermission: 'none',
        source: 'local',
      },
    };
  }

  if (/^(?:go\s+home|home\s+screen|go\s+to\s+home)[.!?]*$/i.test(lower)) {
    return {
      matchedLocally: true,
      interpretation: {
        spokenReply: 'Going home.',
        robotState: 'SUCCESS',
        intent: 'GO_HOME',
        category: 'ACCESSIBILITY_UI',
        parameters: {},
        requiresConfirmation: false,
        requiredPermission: 'none',
        source: 'local',
      },
    };
  }

  if (/\b(recent\s+apps|open\s+recents|app\s+switcher)\b/i.test(lower)) {
    return {
      matchedLocally: true,
      interpretation: {
        spokenReply: 'Opening recent apps.',
        robotState: 'SUCCESS',
        intent: 'OPEN_RECENTS',
        category: 'ACCESSIBILITY_UI',
        parameters: {},
        requiresConfirmation: false,
        requiredPermission: 'accessibility',
        source: 'local',
      },
    };
  }

  // 20. Consequential / Restricted Safety-Gated Actions (Delete, Purchase, Transfer, Email, Post)
  if (/\b(pay|purchase|buy|delete|erase|remove file|transfer money|send (?:an )?email|post this)\b/i.test(lower)) {
    return {
      matchedLocally: true,
      interpretation: {
        spokenReply:
          "That's a sensitive action. I never complete purchases, transfers, posts, or deletions automatically—please confirm and complete it directly.",
        robotState: 'SORRY',
        intent: 'UNSUPPORTED_ANDROID_ACTION',
        category: 'UNSUPPORTED_RESTRICTED',
        parameters: {},
        requiresConfirmation: true,
        requiredPermission: 'none',
        source: 'local',
      },
    };
  }

  // 21. Dynamic Open Any Installed App ("Open WhatsApp", "Open Instagram", "Open Chrome", "Open Spotify")
  const openAppMatch = cleaned.match(/^(?:open|launch|start)\s+([a-zA-Z0-9\s.+&-]{2,32})[.!?]*$/i);
  if (openAppMatch) {
    const appName = openAppMatch[1].replace(/[.!?]+$/, '').trim();
    return {
      matchedLocally: true,
      interpretation: {
        spokenReply: `Opening ${appName}.`,
        robotState: 'SUCCESS',
        intent: 'OPEN_APP',
        category: 'APP_LAUNCH',
        parameters: { appName },
        requiresConfirmation: false,
        requiredPermission: 'none',
        source: 'local',
      },
    };
  }

  // 22. Simple Offline Greeting
  if (/^(hi|hello|hey|good morning|good evening|good afternoon|how are you)[!.?\s]*$/i.test(lower)) {
    return {
      matchedLocally: true,
      interpretation: {
        spokenReply: toneWrap(
          `Hi! I'm ${assistantName}, ready whenever you are.`,
          personality
        ),
        robotState: 'SPEAKING',
        intent: 'CONVERSATION',
        category: 'INFORMATION',
        parameters: {},
        requiresConfirmation: false,
        requiredPermission: 'none',
        source: 'local',
      },
    };
  }

  // 23. Not a deterministic local phone command -> Route to Gemini when online, or give honest offline reply
  const category: CommandCategory = 'CLOUD_GEMINI';
  return {
    matchedLocally: false,
    interpretation: {
      spokenReply: isOnline
        ? 'Checking with Gemini...'
        : "I'm offline, so I can't answer that right now. Local phone commands like apps, flashlight, timers, and settings still work.",
      robotState: isOnline ? 'THINKING' : 'SORRY',
      intent: isOnline ? 'CONVERSATION' : 'CLARIFY',
      category,
      parameters: {},
      requiresConfirmation: false,
      requiredPermission: 'none',
      requiresCloud: true,
      source: 'local',
    },
  };
}
