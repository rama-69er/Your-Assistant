import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

const INTERPRETATION_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    spokenReply: {
      type: Type.STRING,
      description: 'Concise, natural, friendly spoken response (1-2 sentences max).',
    },
    robotState: {
      type: Type.STRING,
      description: 'One of: IDLE, SPEAKING, SUCCESS, CONFUSED, SORRY',
    },
    intent: {
      type: Type.STRING,
      description:
        'One of: OPEN_CAMERA, TAKE_PHOTO_TIMER, OPEN_YOUTUBE_SEARCH, OPEN_MAPS_NAVIGATE, COMPOSE_MESSAGE, FIND_PHOTO, READ_NOTIFICATIONS, SCROLL_PAGE, NAVIGATE_BACK, GO_HOME, LIST_CAPABILITIES, CLARIFY, CONVERSATION, UNSUPPORTED_ANDROID_ACTION',
    },
    requiresConfirmation: {
      type: Type.BOOLEAN,
      description:
        'True for consequential operations like composing/sending messages, payments, deletions, or posting.',
    },
    requiredPermission: {
      type: Type.STRING,
      description:
        'One of: none, microphone, camera, photos, notifications, overlay, accessibility, notification_listener',
    },
    missingInfoQuestion: {
      type: Type.STRING,
      description: 'Optional follow-up question when the command is unclear.',
    },
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: { type: Type.STRING },
        destination: { type: Type.STRING },
        contact: { type: Type.STRING },
        messageBody: { type: Type.STRING },
        timerSeconds: { type: Type.INTEGER },
        direction: { type: Type.STRING },
        photoSubject: { type: Type.STRING },
        appName: { type: Type.STRING },
      },
    },
  },
  required: ['spokenReply', 'robotState', 'intent', 'requiresConfirmation', 'requiredPermission', 'parameters'],
};

async function createServer() {
  const app = express();
  app.use(express.json({ limit: '6mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      geminiConfigured: Boolean(getGeminiClient()),
      persistence: 'ephemeral_none',
    });
  });

  app.post('/api/shimi/interpret', async (req, res) => {
    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        error: 'GEMINI_NOT_CONFIGURED',
        message: 'Gemini API key is not configured on the server.',
      });
      return;
    }

    const { utterance, assistantName, personality, permissions, recentContext } = req.body ?? {};
    if (typeof utterance !== 'string' || !utterance.trim()) {
      res.status(400).json({ error: 'INVALID_UTTERANCE', message: 'Utterance text is required.' });
      return;
    }

    const safeName = typeof assistantName === 'string' && assistantName.trim() ? assistantName.trim() : 'Shimi';
    const safePersonality =
      personality === 'playful' || personality === 'calm' ? personality : 'warm';

    const contextSummary = Array.isArray(recentContext)
      ? recentContext
          .slice(-4)
          .map((turn: { role?: string; text?: string }) => `${turn.role === 'user' ? 'User' : safeName}: ${String(turn.text ?? '')}`)
          .join('\n')
      : '';

    const systemInstruction = `You are ${safeName}, a cute, trustworthy, privacy-first personal phone assistant.
Personality: ${safePersonality === 'playful' ? 'warm, upbeat, lightly playful' : safePersonality === 'calm' ? 'calm, steady, concise' : 'warm, friendly, helpful'}.
Keep spokenReply concise (1-2 short natural sentences). Never claim you did something you cannot do.

Current platform runtime: Installable Web/PWA companion (with native Android blueprint).
Current browser/device permissions: ${JSON.stringify(permissions ?? {})}.

Rules:
1. If user asks to open camera or take a picture (optionally with countdown seconds), map to OPEN_CAMERA or TAKE_PHOTO_TIMER with timerSeconds (default 3 if unspecified). If camera permission is "denied", set robotState to "SORRY" and explain clearly that camera permission is needed.
2. If user asks to search YouTube, map to OPEN_YOUTUBE_SEARCH with parameters.query. If query is missing, map to CLARIFY and robotState "CONFUSED".
3. If user asks to open Maps / navigate, map to OPEN_MAPS_NAVIGATE with parameters.destination. If destination is vague like "my destination", map to CLARIFY and robotState "CONFUSED".
4. If user asks to send/compose a WhatsApp or SMS message, map to COMPOSE_MESSAGE with parameters.contact, parameters.messageBody, parameters.appName, and ALWAYS set requiresConfirmation = true. Never pretend it was already sent.
5. If user asks to find a picture in gallery (e.g. "find a picture of Lucky"), map to FIND_PHOTO with parameters.photoSubject and requiredPermission = "photos". Explain that you open the scoped Photo Picker so they stay in control.
6. If user asks to read system notifications from other apps, map to READ_NOTIFICATIONS, robotState = "SORRY", requiredPermission = "notification_listener", and honestly explain that reading other apps' Android notifications requires the native Android Notification Listener permission.
7. If user asks to scroll down/up, go back, or go home, map to SCROLL_PAGE (direction: "up"|"down"), NAVIGATE_BACK, or GO_HOME.
8. If user asks to pay, buy, transfer money, or delete data, map to UNSUPPORTED_ANDROID_ACTION, requiresConfirmation = true, robotState = "SORRY", and explain that you never bypass security or execute payments/deletions automatically.
9. If user asks what you can do, map to LIST_CAPABILITIES and briefly list your real supported actions.
10. If unclear, map to CLARIFY and robotState = "CONFUSED".`;

    const promptText = contextSummary
      ? `Recent session context (ephemeral, not stored):\n${contextSummary}\n\nLatest user command:\n${utterance.trim()}`
      : `Latest user command:\n${utterance.trim()}`;

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: promptText,
        config: {
          systemInstruction,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: INTERPRETATION_SCHEMA,
        },
      });

      const rawText = (response.text ?? '').trim();
      const parsed = JSON.parse(rawText);

      // Enforce hard confirmation invariant server-side for consequential intents
      if (parsed.intent === 'COMPOSE_MESSAGE' || parsed.intent === 'UNSUPPORTED_ANDROID_ACTION') {
        parsed.requiresConfirmation = true;
      }

      res.json({
        ...parsed,
        source: 'gemini',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to reach Gemini API.';
      res.status(502).json({
        error: 'GEMINI_CALL_FAILED',
        message,
      });
    }
  });

  app.post('/api/shimi/tts', async (req, res) => {
    const ai = getGeminiClient();
    if (!ai) {
      res.json({
        audioBase64: null,
        fallback: 'device_tts',
        reason: 'Gemini API key is not configured on the server.',
      });
      return;
    }

    const { text, personality } = req.body ?? {};
    if (typeof text !== 'string' || !text.trim()) {
      res.status(400).json({ error: 'INVALID_TEXT', message: 'Text is required for TTS.' });
      return;
    }

    const voiceName = personality === 'calm' ? 'Kore' : personality === 'playful' ? 'Puck' : 'Zephyr';

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash-lite-tts',
        contents: [
          {
            role: 'user',
            parts: [{ text: text.trim().slice(0, 420) }],
          },
        ],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName },
            },
          },
        },
      });

      const base64Audio =
        response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

      if (!base64Audio) {
        res.json({ audioBase64: null, fallback: 'device_tts', reason: 'No audio returned by TTS.' });
        return;
      }

      res.json({
        mimeType: 'audio/wav',
        audioBase64: base64Audio,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gemini TTS unavailable.';
      res.json({
        audioBase64: null,
        fallback: 'device_tts',
        reason: message,
      });
    }
  });

  // Ephemeral in-memory scoped photo matcher (never writes to disk or stores photos)
  app.post('/api/shimi/analyze-photo', async (req, res) => {
    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        error: 'GEMINI_NOT_CONFIGURED',
        message: 'Cloud photo analysis requires Gemini server configuration.',
      });
      return;
    }

    const { imageBase64, mimeType, subject } = req.body ?? {};
    if (typeof imageBase64 !== 'string' || typeof subject !== 'string' || !subject.trim()) {
      res.status(400).json({ error: 'INVALID_REQUEST', message: 'Image data and subject are required.' });
      return;
    }

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: typeof mimeType === 'string' ? mimeType : 'image/jpeg',
                data: imageBase64,
              },
            },
            {
              text: `Does this photo clearly match the user's request to find "${subject.trim()}"? Return JSON with matched (boolean) and reason (short 1-sentence visual description).`,
            },
          ],
        },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              matched: { type: Type.BOOLEAN },
              reason: { type: Type.STRING },
            },
            required: ['matched', 'reason'],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim());
      res.json({
        matched: Boolean(parsed.matched),
        reason: typeof parsed.reason === 'string' ? parsed.reason : 'Analyzed temporarily in memory.',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Photo analysis failed.';
      res.status(502).json({ error: 'PHOTO_ANALYSIS_FAILED', message });
    }
  });

  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Shimi server running at http://0.0.0.0:${PORT}`);
  });
}

createServer().catch((err) => {
  console.error('Failed to start Shimi server:', err);
  process.exit(1);
});
