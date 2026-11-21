import 'dotenv/config';
import express from 'express';
import fs from 'fs';
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

function collectAndroidProjectFiles(rootDir: string): { label: string; path: string; content: string }[] {
  const androidDir = path.resolve(rootDir, 'android');
  if (!fs.existsSync(androidDir)) return [];

  const results: { label: string; path: string; content: string }[] = [];
  const walk = (dir: string) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'build' || entry.name === '.gradle') continue;
        walk(fullPath);
      } else if (/\.(kt|kts|xml|properties|md)$/i.test(entry.name)) {
        const relPath = path.relative(rootDir, fullPath).replace(/\\/g, '/');
        results.push({
          label: entry.name,
          path: relPath,
          content: fs.readFileSync(fullPath, 'utf8'),
        });
      }
    }
  };
  walk(androidDir);
  return results;
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
    category: {
      type: Type.STRING,
      description:
        'One of: LOCAL_ANDROID_ACTION, ACCESSIBILITY_UI, APP_LAUNCH, COMMUNICATION, DEVICE_SETTING, INFORMATION, CLOUD_GEMINI, UNSUPPORTED_RESTRICTED',
    },
    intent: {
      type: Type.STRING,
      description:
        'One of: OPEN_CAMERA, TAKE_PHOTO_TIMER, OPEN_YOUTUBE_SEARCH, OPEN_MAPS_NAVIGATE, OPEN_CHROME_SEARCH, COMPOSE_MESSAGE, CALL_CONTACT, OPEN_CONTACTS, OPEN_CALENDAR, SET_REMINDER, FIND_PHOTO, READ_NOTIFICATIONS, FLASHLIGHT_TOGGLE, VOLUME_CONTROL, MEDIA_CONTROL, SET_TIMER, SET_ALARM, OPEN_APP, OPEN_SETTINGS, SCROLL_PAGE, CLICK_UI_ELEMENT, NAVIGATE_BACK, GO_HOME, OPEN_RECENTS, LIST_CAPABILITIES, CLARIFY, CONVERSATION, UNSUPPORTED_ANDROID_ACTION',
    },
    requiresConfirmation: {
      type: Type.BOOLEAN,
      description:
        'True for consequential operations like sending messages, calling, payments, deletions, or posting.',
    },
    requiredPermission: {
      type: Type.STRING,
      description:
        'One of: none, microphone, camera, photos, notifications, contacts, overlay, accessibility, notification_listener, battery_optimization',
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
        alarmHour: { type: Type.INTEGER },
        alarmMinute: { type: Type.INTEGER },
        direction: { type: Type.STRING },
        photoSubject: { type: Type.STRING },
        appName: { type: Type.STRING },
        uiElementText: { type: Type.STRING },
        reminderText: { type: Type.STRING },
        reminderTime: { type: Type.STRING },
      },
    },
  },
  required: [
    'spokenReply',
    'robotState',
    'category',
    'intent',
    'requiresConfirmation',
    'requiredPermission',
    'parameters',
  ],
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

  // Serves the actual native Android Kotlin/Gradle files stored in /android/
  app.get('/api/android-project', (_req, res) => {
    try {
      const files = collectAndroidProjectFiles(__dirname);
      res.json({ count: files.length, files });
    } catch {
      res.status(500).json({ error: 'READ_FAILED', files: [] });
    }
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

    const systemInstruction = `You are ${safeName}, a cute, trustworthy, privacy-first personal Android phone assistant.
Personality: ${safePersonality === 'playful' ? 'warm, upbeat, lightly playful' : safePersonality === 'calm' ? 'calm, steady, concise' : 'warm, friendly, helpful'}.
Keep spokenReply concise (1-2 short natural sentences). Never claim you did something you cannot do.

Current device permissions: ${JSON.stringify(permissions ?? {})}.

Rules:
1. Simple phone actions (flashlight, volume, timers, alarms, apps, settings) are normally handled locally, so if one reaches you because of complex phrasing, map it cleanly to the exact structured intent.
2. For open-ended questions (cooking ideas, trivia, advice, planning), answer concisely in spokenReply with intent = "CONVERSATION", category = "CLOUD_GEMINI", robotState = "SPEAKING".
3. For consequential actions (COMPOSE_MESSAGE, CALL_CONTACT, payments, deletions, emails, posting), ALWAYS set requiresConfirmation = true. Never pretend it was already executed.
4. For unclear commands, map to CLARIFY and robotState = "CONFUSED".`;

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

      if (
        parsed.intent === 'COMPOSE_MESSAGE' ||
        parsed.intent === 'CALL_CONTACT' ||
        parsed.intent === 'UNSUPPORTED_ANDROID_ACTION'
      ) {
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
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
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
