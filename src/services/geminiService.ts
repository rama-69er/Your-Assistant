import { interpretCommandLocally } from '../core/commandInterpreter';
import type {
  ConversationTurn,
  PersonalityStyle,
  PermissionStatusMap,
  ShimiInterpretation,
} from '../core/types';

export interface ServerHealthStatus {
  ok: boolean;
  geminiConfigured: boolean;
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

export async function interpretCommand(params: {
  utterance: string;
  assistantName: string;
  personality: PersonalityStyle;
  permissions: PermissionStatusMap;
  cloudGeminiEnabled: boolean;
  recentContext: ConversationTurn[];
}): Promise<{ interpretation: ShimiInterpretation; cloudError?: string }> {
  const {
    utterance,
    assistantName,
    personality,
    permissions,
    cloudGeminiEnabled,
    recentContext,
  } = params;

  if (!cloudGeminiEnabled) {
    return {
      interpretation: interpretCommandLocally(utterance, assistantName, personality, permissions),
    };
  }

  try {
    const res = await fetch('/api/shimi/interpret', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
      // Fall back transparently to local rule-based interpreter and surface the cloud error honestly
      const localFallback = interpretCommandLocally(utterance, assistantName, personality, permissions);
      return {
        interpretation: localFallback,
        cloudError: errorMsg,
      };
    }

    return {
      interpretation: {
        spokenReply: String(data.spokenReply || "I'm here to help!"),
        robotState: data.robotState || 'SPEAKING',
        intent: data.intent || 'CONVERSATION',
        parameters: data.parameters || {},
        requiresConfirmation: Boolean(data.requiresConfirmation),
        requiredPermission: data.requiredPermission || 'none',
        missingInfoQuestion: data.missingInfoQuestion,
        source: 'gemini',
      },
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Network error reaching Gemini server.';
    const localFallback = interpretCommandLocally(utterance, assistantName, personality, permissions);
    return {
      interpretation: localFallback,
      cloudError: errorMsg,
    };
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
