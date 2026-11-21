import type {
  ActionExecutionRecord,
  PermissionStatusMap,
  ShimiInterpretation,
} from '../core/types';

export interface ActionDispatchCallbacks {
  onOpenCamera: (timerSeconds?: number) => void;
  onOpenPhotoPicker: (subject: string) => void;
  onScrollPage: (direction: 'up' | 'down') => void;
  onNavigateBack: () => void;
  onGoHome: () => void;
}

/**
 * ActionDispatcher translates structured Gemini/local interpretations into
 * real, verified action execution records and concrete UI/device triggers.
 * Never fabricates success for blocked or Android-native-only actions.
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
  const base = {
    id,
    timestamp: Date.now(),
    userUtterance: utterance,
    intent: interpretation.intent,
    requiredPermission: interpretation.requiredPermission,
    parameters: interpretation.parameters,
    requiresConfirmation: interpretation.requiresConfirmation,
  };

  switch (interpretation.intent) {
    case 'OPEN_CAMERA':
    case 'TAKE_PHOTO_TIMER': {
      if (permissions.camera === 'denied') {
        return {
          ...base,
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
          status: 'error',
          summary: 'Missing YouTube search query',
          detail: 'Tell me what video or topic you want to search on YouTube.',
        };
      }
      const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
      return {
        ...base,
        status: 'executed',
        summary: `Prepared YouTube search for "${query}"`,
        detail: 'Tap the link below to open YouTube directly (works on Android app links & web).',
        actionUrl: url,
        actionUrlLabel: `Open YouTube: "${query}"`,
      };
    }

    case 'OPEN_MAPS_NAVIGATE': {
      const destination = interpretation.parameters.destination?.trim();
      if (!destination) {
        return {
          ...base,
          status: 'error',
          summary: 'Missing navigation destination',
          detail: 'Tell me the place or address you want directions to.',
        };
      }
      const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
      return {
        ...base,
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
        requiresConfirmation: true,
        status: 'pending_confirmation',
        summary: `Confirm ${isWhatsApp ? 'WhatsApp' : 'SMS'} draft for ${contact}`,
        detail: `Message: "${body}". ${safeName} never sends messages without your explicit confirmation.`,
        actionUrl,
        actionUrlLabel: isWhatsApp ? `Open WhatsApp draft` : `Open Messages draft`,
      };
    }

    case 'FIND_PHOTO': {
      const subject = interpretation.parameters.photoSubject?.trim() || 'your photo';
      callbacks.onOpenPhotoPicker(subject);
      return {
        ...base,
        status: 'executed',
        summary: `Opened scoped Photo Picker for "${subject}"`,
        detail: 'Select specific photos to inspect temporarily in memory. Full background gallery access is never requested.',
      };
    }

    case 'READ_NOTIFICATIONS': {
      return {
        ...base,
        status: 'unsupported_in_web',
        summary: 'Blocked — requires native Android Notification Access',
        detail:
          'Browsers and PWAs cannot read notifications from other apps. Install the native Android Kotlin build and grant Notification Listener permission.',
      };
    }

    case 'SCROLL_PAGE': {
      const direction = interpretation.parameters.direction === 'up' ? 'up' : 'down';
      callbacks.onScrollPage(direction);
      return {
        ...base,
        status: 'executed',
        summary: `Scrolled ${direction} in Shimi`,
        detail:
          'Scrolling inside other installed Android apps requires enabling ShimiAccessibilityService in the native Android build.',
      };
    }

    case 'NAVIGATE_BACK': {
      callbacks.onNavigateBack();
      return {
        ...base,
        status: 'executed',
        summary: 'Navigated back to previous view',
        detail: 'System-wide Back across third-party apps requires native Android Accessibility Service.',
      };
    }

    case 'GO_HOME': {
      callbacks.onGoHome();
      return {
        ...base,
        status: 'executed',
        summary: 'Returned to Shimi dashboard',
        detail: 'Returning to the Android launcher home screen requires native Android Accessibility Service.',
      };
    }

    case 'UNSUPPORTED_ANDROID_ACTION': {
      return {
        ...base,
        status: 'unsupported_in_web',
        summary: 'Action restricted for your safety & platform limits',
        detail:
          'Shimi never bypasses authentication, payment confirmation, or protected Android security boundaries.',
      };
    }

    case 'LIST_CAPABILITIES':
    case 'CONVERSATION': {
      return {
        ...base,
        status: 'executed',
        summary: interpretation.intent === 'LIST_CAPABILITIES' ? 'Shared supported capabilities' : 'Responded conversationally',
      };
    }

    case 'CLARIFY':
    default: {
      return {
        ...base,
        status: 'error',
        summary: 'Awaiting clarification',
        detail: interpretation.missingInfoQuestion || 'Could you rephrase or add more details?',
      };
    }
  }
}
