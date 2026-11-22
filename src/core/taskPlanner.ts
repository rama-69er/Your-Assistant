import type { InstalledAppInfo, TaskPlanPreview, TaskStepItem } from './types';

function makePlanId(): string {
  return `plan_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Pure TypeScript mirror of Android's Kotlin `TaskPlanner`.
 * Compiles multi-step voice commands into ordered TaskStep pipelines so both
 * the Debug Pipeline UI and unit tests can inspect exact execution plans and
 * confirmation gates.
 */
export function planMultiStepTask(
  utterance: string,
  confirmConsequentialActions = true
): TaskPlanPreview | null {
  const cleaned = utterance.trim();
  if (!cleaned) return null;

  // Pattern 1: "Open WhatsApp and message/send a message to Rahul that I'm reaching in 10 minutes"
  // Also handles: "Go to Rahul and send him 'I'm reaching in 10 minutes'"
  const whatsappMessageMatch = cleaned.match(
    /(?:open\s+(whatsapp|messages|sms|telegram)\s+(?:and\s+)?)?(?:send\s+(?:a\s+)?message\s+to|message|text|go\s+to)\s+([a-z0-9 .'-]{2,32}?)(?:\s+(?:and\s+send(?:\s+(?:him|her|them))?|saying|that|:)\s+(.+))$/i
  );

  if (whatsappMessageMatch) {
    const appName = whatsappMessageMatch[1]
      ? whatsappMessageMatch[1].charAt(0).toUpperCase() + whatsappMessageMatch[1].slice(1)
      : 'WhatsApp';
    const contact = whatsappMessageMatch[2].trim().replace(/['"]/g, '');
    const messageBody = whatsappMessageMatch[3].trim().replace(/^['"]|['"]$/g, '');

    if (contact && messageBody) {
      const steps: TaskStepItem[] = [
        {
          index: 1,
          type: 'OPEN_APP',
          description: `Open ${appName}`,
          target: appName,
          status: 'COMPLETED',
        },
        {
          index: 2,
          type: 'WAIT_FOR_APP',
          description: `Wait for ${appName} window to load`,
          target: appName,
          status: 'COMPLETED',
        },
        {
          index: 3,
          type: 'FIND_UI',
          description: `Find chat for ${contact}`,
          target: contact,
          status: 'PENDING',
        },
        {
          index: 4,
          type: 'CLICK',
          description: `Open conversation with ${contact}`,
          target: contact,
          status: 'PENDING',
        },
        {
          index: 5,
          type: 'TYPE',
          description: `Draft message "${messageBody}"`,
          target: 'Message input',
          value: messageBody,
          status: 'PENDING',
        },
      ];

      if (confirmConsequentialActions) {
        steps.push({
          index: 6,
          type: 'CONFIRM',
          description: `Confirm before sending message to ${contact}`,
          target: contact,
          value: messageBody,
          requiresConfirmation: true,
          status: 'WAITING_CONFIRMATION',
        });
        steps.push({
          index: 7,
          type: 'CLICK',
          description: 'Tap Send button',
          target: 'Send',
          status: 'PENDING',
        });
      } else {
        steps.push({
          index: 6,
          type: 'CLICK',
          description: 'Tap Send button',
          target: 'Send',
          status: 'PENDING',
        });
      }

      return {
        id: makePlanId(),
        title: `Message ${contact} via ${appName}`,
        originalUtterance: cleaned,
        targetAppName: appName,
        requiresAccessibility: true,
        hasConfirmationGate: confirmConsequentialActions,
        steps,
      };
    }
  }

  // Pattern 2: "Open YouTube and search for relaxing music"
  const youtubeSearchMatch = cleaned.match(
    /open\s+youtube\s+and\s+(?:search\s+(?:for\s+)?|play\s+)(.+)/i
  );
  if (youtubeSearchMatch) {
    const query = youtubeSearchMatch[1].trim().replace(/[.?!]+$/, '');
    if (query) {
      return {
        id: makePlanId(),
        title: `Search YouTube for "${query}"`,
        originalUtterance: cleaned,
        targetAppName: 'YouTube',
        requiresAccessibility: false,
        hasConfirmationGate: false,
        steps: [
          {
            index: 1,
            type: 'OPEN_APP',
            description: 'Open YouTube with search query intent',
            target: 'YouTube',
            value: query,
            status: 'COMPLETED',
          },
          {
            index: 2,
            type: 'VERIFY',
            description: `Verify YouTube search results for "${query}"`,
            target: query,
            status: 'COMPLETED',
          },
        ],
      };
    }
  }

  // Pattern 3: "Open Maps and navigate to <destination>"
  const mapsNavMatch = cleaned.match(
    /open\s+(?:google\s+)?maps\s+and\s+(?:navigate|directions|route)\s+to\s+(.+)/i
  );
  if (mapsNavMatch) {
    const destination = mapsNavMatch[1].trim().replace(/[.?!]+$/, '');
    if (destination) {
      return {
        id: makePlanId(),
        title: `Navigate to ${destination} in Maps`,
        originalUtterance: cleaned,
        targetAppName: 'Maps',
        requiresAccessibility: false,
        hasConfirmationGate: false,
        steps: [
          {
            index: 1,
            type: 'OPEN_APP',
            description: `Open Google Maps navigation to ${destination}`,
            target: 'Maps',
            value: destination,
            status: 'COMPLETED',
          },
          {
            index: 2,
            type: 'VERIFY',
            description: 'Confirm navigation route loaded',
            target: destination,
            status: 'COMPLETED',
          },
        ],
      };
    }
  }

  return null;
}

export interface AppDisambiguationResult {
  matched: InstalledAppInfo | null;
  ambiguous: InstalledAppInfo[];
  prompt?: string;
}

/**
 * Pure mirror of Android `AppLauncher` matching logic supporting dynamic
 * app discovery and multi-match disambiguation.
 */
export function resolveInstalledAppMatch(
  query: string,
  installedApps: InstalledAppInfo[]
): AppDisambiguationResult {
  const normalized = query.trim().toLowerCase();
  if (!normalized || installedApps.length === 0) {
    return { matched: null, ambiguous: [] };
  }

  const exact = installedApps.find((app) => app.label.toLowerCase() === normalized);
  if (exact) {
    return { matched: exact, ambiguous: [] };
  }

  const partials = installedApps.filter(
    (app) =>
      app.label.toLowerCase().includes(normalized) ||
      app.packageName.toLowerCase().includes(normalized)
  );

  if (partials.length === 1) {
    return { matched: partials[0], ambiguous: [] };
  }

  if (partials.length > 1) {
    const top = partials.slice(0, 4);
    const names = top.map((a) => a.label).join(', ');
    return {
      matched: null,
      ambiguous: top,
      prompt: `I found ${top.length} matching apps: ${names}. Which one should I open?`,
    };
  }

  return { matched: null, ambiguous: [] };
}
