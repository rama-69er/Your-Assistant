import type {
  PersonalityStyle,
  PermissionStatusMap,
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
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function stripWakePhrase(utterance: string, assistantName: string): string {
  const trimmed = utterance.trim();
  if (!trimmed) return '';
  const safeName = escapeRegExp(assistantName.trim() || 'Shimi');
  const pattern = new RegExp(`^(?:(?:hey|hi|ok|okay|hello)\\s+)?${safeName}[,:.!?\\s]+`, 'i');
  return trimmed.replace(pattern, '').trim();
}

export function extractSeconds(text: string): number | undefined {
  const digitMatch = text.match(/\b(\d{1,2})\s*(?:seconds?|secs?|s)\b/i);
  if (digitMatch) {
    const val = Number.parseInt(digitMatch[1], 10);
    if (val >= 1 && val <= 30) return val;
  }
  const wordPattern = new RegExp(
    `\\b(${Object.keys(NUMBER_WORDS).join('|')})\\s*(?:seconds?|secs?)\\b`,
    'i'
  );
  const wordMatch = text.match(wordPattern);
  if (wordMatch) {
    return NUMBER_WORDS[wordMatch[1].toLowerCase()];
  }
  return undefined;
}

function toneWrap(base: string, personality: PersonalityStyle): string {
  if (personality === 'playful') {
    return base;
  }
  if (personality === 'calm') {
    return base.replace(/!/g, '.');
  }
  return base;
}

/**
 * Deterministic local command interpreter.
 * Runs completely on-device when Cloud Gemini Processing is paused,
 * and serves as a structural safety reference for permission & confirmation rules.
 */
export function interpretCommandLocally(
  rawUtterance: string,
  assistantName: string,
  personality: PersonalityStyle,
  permissions: PermissionStatusMap
): ShimiInterpretation {
  const cleaned = stripWakePhrase(rawUtterance, assistantName);
  const lower = cleaned.toLowerCase();

  if (!cleaned || cleaned.length < 2) {
    return {
      spokenReply: toneWrap(
        "Sorry, I didn't quite catch that. Could you say that again?",
        personality
      ),
      robotState: 'CONFUSED',
      intent: 'CLARIFY',
      parameters: {},
      requiresConfirmation: false,
      requiredPermission: 'none',
      missingInfoQuestion: 'What would you like me to help with?',
      source: 'local',
    };
  }

  // What can you do / help
  if (
    /\b(what can you do|help|capabilities|commands|who are you)\b/i.test(lower)
  ) {
    return {
      spokenReply: toneWrap(
        `I'm ${assistantName}! I can open your camera with a countdown timer, search YouTube, prepare Google Maps navigation, help draft messages with your confirmation, search photos you pick, and scroll or navigate inside the app.`,
        personality
      ),
      robotState: 'SPEAKING',
      intent: 'LIST_CAPABILITIES',
      parameters: {},
      requiresConfirmation: false,
      requiredPermission: 'none',
      source: 'local',
    };
  }

  // Take a photo with timer
  if (
    /\b(take a (?:picture|photo|selfie)|snap a photo|countdown|timer)\b/i.test(lower) &&
    /\b(picture|photo|selfie|camera|snap)\b/i.test(lower)
  ) {
    const timerSeconds = extractSeconds(lower) ?? 3;
    if (permissions.camera === 'denied') {
      return {
        spokenReply:
          'I need camera permission before I can take a picture. Please enable Camera in Permissions.',
        robotState: 'SORRY',
        intent: 'TAKE_PHOTO_TIMER',
        parameters: { timerSeconds },
        requiresConfirmation: false,
        requiredPermission: 'camera',
        source: 'local',
      };
    }
    return {
      spokenReply: toneWrap(
        `Getting your camera ready! I'll take a picture after ${timerSeconds} seconds.`,
        personality
      ),
      robotState: 'SUCCESS',
      intent: 'TAKE_PHOTO_TIMER',
      parameters: { timerSeconds },
      requiresConfirmation: false,
      requiredPermission: 'camera',
      source: 'local',
    };
  }

  // Open camera
  if (/\b(open|launch|start)\b.*\bcamera\b/i.test(lower) || lower === 'camera') {
    if (permissions.camera === 'denied') {
      return {
        spokenReply:
          'I need camera permission before I can open your camera. You can enable it in the Permissions tab.',
        robotState: 'SORRY',
        intent: 'OPEN_CAMERA',
        parameters: {},
        requiresConfirmation: false,
        requiredPermission: 'camera',
        source: 'local',
      };
    }
    return {
      spokenReply: toneWrap('Opening your camera!', personality),
      robotState: 'SUCCESS',
      intent: 'OPEN_CAMERA',
      parameters: {},
      requiresConfirmation: false,
      requiredPermission: 'camera',
      source: 'local',
    };
  }

  // YouTube search
  if (/\byoutube\b/i.test(lower)) {
    const queryMatch = cleaned.match(
      /(?:search(?:\s+for)?|find|play|watch|look up)\s+(.+)$/i
    );
    const query = queryMatch ? queryMatch[1].replace(/\bon youtube\b/gi, '').trim() : '';
    if (!query) {
      return {
        spokenReply: toneWrap(
          'Sure! What would you like me to search for on YouTube?',
          personality
        ),
        robotState: 'CONFUSED',
        intent: 'CLARIFY',
        parameters: { appName: 'YouTube' },
        requiresConfirmation: false,
        requiredPermission: 'none',
        missingInfoQuestion: 'What should I search on YouTube?',
        source: 'local',
      };
    }
    return {
      spokenReply: toneWrap(`Ready to search YouTube for "${query}"!`, personality),
      robotState: 'SUCCESS',
      intent: 'OPEN_YOUTUBE_SEARCH',
      parameters: { query, appName: 'YouTube' },
      requiresConfirmation: false,
      requiredPermission: 'none',
      source: 'local',
    };
  }

  // Google Maps navigation
  if (/\b(maps|navigate|directions|route to)\b/i.test(lower)) {
    const destMatch = cleaned.match(
      /(?:navigate(?:\s+to)?|directions(?:\s+to)?|route(?:\s+to)?|go to)\s+(.+)$/i
    );
    const destination = destMatch
      ? destMatch[1].replace(/\b(?:on|in|using)\s+(?:google\s+)?maps\b/gi, '').trim()
      : '';
    if (!destination || /^(?:my\s+)?destination$/i.test(destination)) {
      return {
        spokenReply: toneWrap(
          'I can prepare Google Maps navigation! Where would you like to go?',
          personality
        ),
        robotState: 'CONFUSED',
        intent: 'CLARIFY',
        parameters: { appName: 'Google Maps' },
        requiresConfirmation: false,
        requiredPermission: 'none',
        missingInfoQuestion: 'Which destination should I navigate to?',
        source: 'local',
      };
    }
    return {
      spokenReply: toneWrap(`Preparing Google Maps navigation to ${destination}!`, personality),
      robotState: 'SUCCESS',
      intent: 'OPEN_MAPS_NAVIGATE',
      parameters: { destination, appName: 'Google Maps' },
      requiresConfirmation: false,
      requiredPermission: 'none',
      source: 'local',
    };
  }

  // Compose message (WhatsApp / SMS) — ALWAYS requires explicit confirmation
  if (/\b(whatsapp|message|text|sms)\b/i.test(lower) && /\b(send|write|compose|help|open|message|text)\b/i.test(lower)) {
    const contactMatch = cleaned.match(/\b(?:to|for)\s+([a-zA-Z0-9\s'-]{2,28}?)(?:\s+(?:saying|that|:|-)\s+(.+))?$/i);
    const contact = contactMatch ? contactMatch[1].trim() : 'your friend';
    const messageBody = contactMatch?.[2]?.trim() || 'Hi! Checking in.';
    const appName = /\bwhatsapp\b/i.test(lower) ? 'WhatsApp' : 'Messages';
    return {
      spokenReply: toneWrap(
        `I drafted a ${appName} message for ${contact}. Please confirm before I hand it off so nothing is sent without your approval.`,
        personality
      ),
      robotState: 'SPEAKING',
      intent: 'COMPOSE_MESSAGE',
      parameters: { contact, messageBody, appName },
      requiresConfirmation: true,
      requiredPermission: 'none',
      source: 'local',
    };
  }

  // Find photo in gallery (scoped Photo Picker only)
  if (/\b(gallery|photo|picture|pictures|photos)\b/i.test(lower) && /\b(find|search|show|look for)\b/i.test(lower)) {
    const subjectMatch = cleaned.match(
      /(?:picture|photo|pictures|photos)\s+of\s+([a-zA-Z0-9\s'-]+?)(?:\s+in\s+(?:my\s+)?gallery)?$/i
    );
    const photoSubject = subjectMatch ? subjectMatch[1].trim() : 'your selected subject';
    return {
      spokenReply: toneWrap(
        `To protect your privacy, I only search photos you pick. Opening the temporary photo picker so we can look for ${photoSubject}.`,
        personality
      ),
      robotState: 'SPEAKING',
      intent: 'FIND_PHOTO',
      parameters: { photoSubject },
      requiresConfirmation: false,
      requiredPermission: 'photos',
      source: 'local',
    };
  }

  // Read notifications (requires native Android NotificationListenerService)
  if (/\bnotification/i.test(lower)) {
    return {
      spokenReply:
        "I can't read system notifications from other apps inside the web app. On Android, that requires granting Shimi's native Notification Listener permission.",
      robotState: 'SORRY',
      intent: 'READ_NOTIFICATIONS',
      parameters: {},
      requiresConfirmation: false,
      requiredPermission: 'notification_listener',
      source: 'local',
    };
  }

  // Scroll down / up
  if (/\bscroll\s+(down|up)\b/i.test(lower)) {
    const direction = /\bscroll\s+up\b/i.test(lower) ? 'up' : 'down';
    return {
      spokenReply: toneWrap(`Scrolling ${direction} right now!`, personality),
      robotState: 'SUCCESS',
      intent: 'SCROLL_PAGE',
      parameters: { direction },
      requiresConfirmation: false,
      requiredPermission: 'none',
      source: 'local',
    };
  }

  // Go back
  if (/\b(go back|back|previous screen)\b/i.test(lower)) {
    return {
      spokenReply: toneWrap('Going back to the previous view.', personality),
      robotState: 'SUCCESS',
      intent: 'NAVIGATE_BACK',
      parameters: {},
      requiresConfirmation: false,
      requiredPermission: 'none',
      source: 'local',
    };
  }

  // Go home
  if (/\b(go home|home screen|dashboard)\b/i.test(lower)) {
    return {
      spokenReply: toneWrap('Heading back to the home dashboard.', personality),
      robotState: 'SUCCESS',
      intent: 'GO_HOME',
      parameters: {},
      requiresConfirmation: false,
      requiredPermission: 'none',
      source: 'local',
    };
  }

  // Consequential destructive / payment requests
  if (/\b(pay|purchase|buy|delete all|erase|transfer money)\b/i.test(lower)) {
    return {
      spokenReply:
        "I never complete payments, purchases, or permanent deletions automatically. You'll need to confirm and complete those directly inside the app.",
      robotState: 'SORRY',
      intent: 'UNSUPPORTED_ANDROID_ACTION',
      parameters: {},
      requiresConfirmation: true,
      requiredPermission: 'none',
      source: 'local',
    };
  }

  // Friendly greeting
  if (/^(hi|hello|hey|good morning|good evening|good afternoon|how are you)[!.?\s]*$/i.test(lower)) {
    return {
      spokenReply: toneWrap(
        `Hi! I'm ${assistantName}, ready whenever you are. Try asking me to open the camera, search YouTube, or prepare Maps directions.`,
        personality
      ),
      robotState: 'SPEAKING',
      intent: 'CONVERSATION',
      parameters: {},
      requiresConfirmation: false,
      requiredPermission: 'none',
      source: 'local',
    };
  }

  return {
    spokenReply: toneWrap(
      "Sorry, I didn't quite understand that offline command. Could you rephrase it, or enable Cloud Gemini Processing in Privacy for natural conversation?",
      personality
    ),
    robotState: 'CONFUSED',
    intent: 'CLARIFY',
    parameters: {},
    requiresConfirmation: false,
    requiredPermission: 'none',
    missingInfoQuestion: 'Could you say that again?',
    source: 'local',
  };
}
