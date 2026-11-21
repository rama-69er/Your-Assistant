import { routeCommandLocally } from '../core/intentRouter';
import type {
  AIMode,
  ConversationTurn,
  PersonalityStyle,
  PermissionStatusMap,
  ShimiInterpretation,
} from '../core/types';

export interface ServerHealthStatus {
  ok: boolean;
  geminiConfigured: boolean;
}

export interface AndroidProjectFile {
  label: string;
  path: string;
  content: string;
}

export async function fetchServerHealth(): Promise<ServerHealthStatus> {
  try {
    const res = await fetch('/api/health');
    if (!res.ok) return { ok: false, geminiConfigured: false };
    const data = await res.json();
    return {
      ok: Boolean(data.ok),
      geminiConfigured: Boolean(data.geminiConfigured),
    };
  } catch {
    return { ok: false, geminiConfigured: false };
  }
}

export async function fetchAndroidProjectFiles(): Promise<AndroidProjectFile[]> {
  try {
    const res = await fetch('/api/android-project');
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data?.files) ? data.files : [];
  } catch {
    return [];
  }
}

/**
 * Offline-First Command Interpretation Pipeline:
 * 1. Always evaluates deterministic local commands FIRST (zero cloud round-trip).
 * 2. Sends ONLY open-ended / complex / conversational requests to Gemini when
 *    online AND aiMode === 'auto' AND cloudGeminiEnabled === true.
 * 3. Enforces a 12-second timeout and falls back gracefully if offline or unavailable.
 */
export async function interpretCommand(params: {
  utterance: string;
  assistantName: string;
  wakeWord?: string;
  personality: PersonalityStyle;
  permissions: PermissionStatusMap;
  cloudGeminiEnabled: boolean;
  aiMode: AIMode;
  confirmConsequentialActions?: boolean;
  recentContext: ConversationTurn[];
}): Promise<{
  interpretation: ShimiInterpretation;
  routedLocally: boolean;
  cloudError?: string;
  durationMs: number;
}> {
  const startedAt = Date.now();
  const {
    utterance,
    assistantName,
    wakeWord,
    personality,
    permissions,
    cloudGeminiEnabled,
    aiMode,
    confirmConsequentialActions = true,
    recentContext,
  } = params;

  const browserOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
  const allowCloud = aiMode === 'auto' && cloudGeminiEnabled && browserOnline;

  // Step 1: Deterministic Local Router FIRST (never wastes Gemini on flashlight, alarms, open app, settings, etc.)
  const localRoute = routeCommandLocally({
    rawUtterance: utterance,
    assistantName,
    wakeWord,
    personality,
    permissions,
    confirmConsequentialActions,
    isOnline: allowCloud,
  });

  if (localRoute.matchedLocally) {
    return {
      interpretation: localRoute.interpretation,
      routedLocally: true,
      durationMs: Date.now() - startedAt,
    };
  }

  // Step 2: Offline or Offline-Only mode -> honest offline response
  if (!allowCloud) {
    return {
      interpretation: {
        ...localRoute.interpretation,
        spokenReply:
          aiMode === 'offline_only' || !cloudGeminiEnabled
            ? "Offline-only mode is active, so I can't send general questions to Gemini right now. Local phone commands still work."
            : "I'm offline, so I can't answer that right now. Local phone commands still work.",
        robotState: 'SORRY',
        source: 'local',
      },
      routedLocally: true,
      durationMs: Date.now() - startedAt,
    };
  }

  // Step 3: Cloud Gemini reasoning with strict 12s timeout guard
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 12_000);

  try {
    const res = await fetch('/api/shimi/interpret', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        utterance,
        assistantName,
        personality,
        permissions,
        recentContext: recentContext.slice(-4).map((t) => ({ role: t.role, text: t.text })),
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      const errorMsg = data?.message || 'Gemini service temporarily unavailable.';
      return {
        interpretation: {
          ...localRoute.interpretation,
          spokenReply:
            "I couldn't reach Gemini right now, so I can't answer that general question. Local phone commands still work.",
          robotState: 'SORRY',
          source: 'local',
        },
        routedLocally: false,
        cloudError: errorMsg,
        durationMs: Date.now() - startedAt,
      };
    }

    return {
      interpretation: {
        spokenReply: String(data.spokenReply || "I'm here to help!"),
        robotState: data.robotState || 'SPEAKING',
        intent: data.intent || 'CONVERSATION',
        category: data.category || 'CLOUD_GEMINI',
        parameters: data.parameters || {},
        requiresConfirmation: Boolean(data.requiresConfirmation) && confirmConsequentialActions,
        requiredPermission: data.requiredPermission || 'none',
        missingInfoQuestion: data.missingInfoQuestion,
        source: 'gemini',
      },
      routedLocally: false,
      durationMs: Date.now() - startedAt,
    };
  } catch (err) {
    const isTimeout = err instanceof DOMException && err.name === 'AbortError';
    const errorMsg = isTimeout
      ? 'Gemini request timed out after 12 seconds.'
      : err instanceof Error
        ? err.message
        : 'Network error reaching Gemini server.';
    return {
      interpretation: {
        ...localRoute.interpretation,
        spokenReply:
          "I couldn't reach Gemini right now, so I can't answer that. Offline phone commands are still available.",
        robotState: 'SORRY',
        source: 'local',
      },
      routedLocally: false,
      cloudError: errorMsg,
      durationMs: Date.now() - startedAt,
    };
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export async function synthesizeGeminiSpeech(
  text: string,
  personality: PersonalityStyle
): Promise<{ audioBase64: string; mimeType: string } | null> {
  try {
    const res = await fetch('/api/shimi/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, personality }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.audioBase64) return null;
    return {
      audioBase64: data.audioBase64,
      mimeType: data.mimeType || 'audio/wav',
    };
  } catch {
    return null;
  }
}

export async function analyzeScopedPhotoEphemerally(params: {
  imageBase64: string;
  mimeType: string;
  subject: string;
}): Promise<{ matched: boolean; reason: string }> {
  const res = await fetch('/api/shimi/analyze-photo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.message || 'Photo analysis failed.');
  }
  return {
    matched: Boolean(data.matched),
    reason: String(data.reason || 'Analyzed temporarily in memory.'),
  };
}
