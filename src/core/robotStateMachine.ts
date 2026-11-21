import type {
  AIMode,
  AssistantPreferences,
  FloatingMode,
  FloatingSize,
  PersonalityStyle,
  RobotAccessory,
  RobotColorTheme,
  RobotState,
  RobotStyle,
  WakeWordSensitivity,
} from './types';

export const ROBOT_COLOR_THEMES: RobotColorTheme[] = [
  {
    id: 'ceramic-cobalt',
    label: 'Ceramic Cobalt',
    shell: '#FFFFFF',
    shellShade: '#E4ECF8',
    accent: '#2563EB',
    visor: '#141E30',
    eyeGlow: '#60A5FA',
  },
  {
    id: 'sage-emerald',
    label: 'Sage Mint',
    shell: '#F4F9F6',
    shellShade: '#D7EBE0',
    accent: '#059669',
    visor: '#13241F',
    eyeGlow: '#34D399',
  },
  {
    id: 'sand-coral',
    label: 'Warm Coral',
    shell: '#FFFBF7',
    shellShade: '#F4E3D7',
    accent: '#EA580C',
    visor: '#231A17',
    eyeGlow: '#FB923C',
  },
  {
    id: 'slate-amber',
    label: 'Graphite Amber',
    shell: '#334155',
    shellShade: '#1E293B',
    accent: '#F59E0B',
    visor: '#0B1120',
    eyeGlow: '#FBBF24',
  },
  {
    id: 'mist-indigo',
    label: 'Cloud Indigo',
    shell: '#F7F6FF',
    shellShade: '#E2E0FA',
    accent: '#4F46E5',
    visor: '#171530',
    eyeGlow: '#818CF8',
  },
];

export const DEFAULT_PREFERENCES: AssistantPreferences = {
  name: 'Shimi',
  onboardingCompleted: false,
  themeId: 'ceramic-cobalt',
  robotStyle: 'pod',
  accessory: 'none',
  personality: 'warm',
  cloudGeminiEnabled: true,
  aiMode: 'auto',
  voiceOutputMode: 'gemini_tts',
  batterySaver: false,
  showFloatingOnStart: true,
  wakePhrasePrefixEnabled: true,
  backgroundAssistantEnabled: false,
  wakeWord: 'Shimi',
  wakeWordEnabled: true,
  wakeWordSensitivity: 'balanced',
  confirmConsequentialActions: true,
  floatingMode: 'overlay',
  floatingSize: 'medium',
  floatingOpacity: 0.92,
  debugModeEnabled: false,
};

export const ROBOT_STATE_META: Record<
  RobotState,
  { label: string; description: string; eyeScaleY: number; animationClass: string }
> = {
  IDLE: {
    label: 'Ready',
    description: 'Blinking gently and watching for your voice.',
    eyeScaleY: 1,
    animationClass: 'shimi-anim-idle',
  },
  LISTENING: {
    label: 'Listening',
    description: 'Attentive to your microphone input.',
    eyeScaleY: 1.12,
    animationClass: 'shimi-anim-listening',
  },
  THINKING: {
    label: 'Thinking',
    description: 'Understanding your request and checking permissions.',
    eyeScaleY: 0.95,
    animationClass: 'shimi-anim-thinking',
  },
  SPEAKING: {
    label: 'Speaking',
    description: 'Responding aloud and updating your speech bubble.',
    eyeScaleY: 1.02,
    animationClass: 'shimi-anim-speaking',
  },
  SUCCESS: {
    label: 'Done',
    description: 'Action confirmed and completed happily.',
    eyeScaleY: 0.85,
    animationClass: 'shimi-anim-success',
  },
  CONFUSED: {
    label: 'Needs clarification',
    description: 'Not quite sure what you meant yet.',
    eyeScaleY: 1,
    animationClass: 'shimi-anim-confused',
  },
  SORRY: {
    label: 'Unable to complete',
    description: 'Blocked by a missing permission or platform limit.',
    eyeScaleY: 0.82,
    animationClass: 'shimi-anim-sorry',
  },
  SLEEPING: {
    label: 'Resting',
    description: 'Low-power idle state while inactive.',
    eyeScaleY: 0.12,
    animationClass: 'shimi-anim-sleeping',
  },
};

export const ALL_ROBOT_STATES: RobotState[] = [
  'IDLE',
  'LISTENING',
  'THINKING',
  'SPEAKING',
  'SUCCESS',
  'CONFUSED',
  'SORRY',
  'SLEEPING',
];

export function getThemeById(themeId: string): RobotColorTheme {
  return ROBOT_COLOR_THEMES.find((t) => t.id === themeId) ?? ROBOT_COLOR_THEMES[0];
}

export function validateAssistantName(raw: string): { valid: boolean; cleaned: string; error?: string } {
  const cleaned = raw.trim().replace(/\s+/g, ' ');
  if (!cleaned) {
    return { valid: false, cleaned: '', error: 'Please give your assistant a name before continuing.' };
  }
  if (cleaned.length < 2) {
    return { valid: false, cleaned, error: 'Name should be at least 2 characters long.' };
  }
  if (cleaned.length > 24) {
    return { valid: false, cleaned, error: 'Keep the name under 24 characters so it fits comfortably.' };
  }
  return { valid: true, cleaned };
}

export function getInactivityTimeoutMs(batterySaver: boolean): number {
  return batterySaver ? 20_000 : 45_000;
}

export function computeNextAutoState(
  current: RobotState,
  elapsedIdleMs: number,
  isSessionActive: boolean,
  batterySaver: boolean
): RobotState {
  if (current === 'LISTENING' || current === 'THINKING' || current === 'SPEAKING') {
    return current;
  }
  if (current === 'SUCCESS' || current === 'CONFUSED' || current === 'SORRY') {
    if (elapsedIdleMs >= 4500) {
      return isSessionActive ? 'IDLE' : 'SLEEPING';
    }
    return current;
  }
  if (current === 'IDLE' && elapsedIdleMs >= getInactivityTimeoutMs(batterySaver)) {
    return 'SLEEPING';
  }
  return current;
}

export function sanitizePreferences(raw: Partial<AssistantPreferences> | null | undefined): AssistantPreferences {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_PREFERENCES };
  }
  const validStyles: RobotStyle[] = ['pod', 'aero', 'deskbot'];
  const validAccessories: RobotAccessory[] = ['none', 'halo', 'beanie', 'glasses', 'headphones', 'star'];
  const validPersonalities: PersonalityStyle[] = ['warm', 'playful', 'calm'];
  const validAIModes: AIMode[] = ['auto', 'offline_only'];
  const validSens: WakeWordSensitivity[] = ['low', 'balanced', 'high'];
  const validFloatingModes: FloatingMode[] = ['overlay', 'bubble', 'notification'];
  const validFloatingSizes: FloatingSize[] = ['small', 'medium', 'large'];

  const nameCheck = validateAssistantName(typeof raw.name === 'string' ? raw.name : '');
  const resolvedName = nameCheck.valid ? nameCheck.cleaned : DEFAULT_PREFERENCES.name;
  const wakeCheck = validateAssistantName(typeof raw.wakeWord === 'string' ? raw.wakeWord : '');

  const aiMode: AIMode = validAIModes.includes(raw.aiMode as AIMode)
    ? (raw.aiMode as AIMode)
    : raw.cloudGeminiEnabled === false
      ? 'offline_only'
      : 'auto';

  const opacity =
    typeof raw.floatingOpacity === 'number' && Number.isFinite(raw.floatingOpacity)
      ? Math.max(0.5, Math.min(1, raw.floatingOpacity))
      : DEFAULT_PREFERENCES.floatingOpacity;

  return {
    name: resolvedName,
    onboardingCompleted: Boolean(raw.onboardingCompleted),
    themeId: ROBOT_COLOR_THEMES.some((t) => t.id === raw.themeId)
      ? (raw.themeId as string)
      : DEFAULT_PREFERENCES.themeId,
    robotStyle: validStyles.includes(raw.robotStyle as RobotStyle)
      ? (raw.robotStyle as RobotStyle)
      : DEFAULT_PREFERENCES.robotStyle,
    accessory: validAccessories.includes(raw.accessory as RobotAccessory)
      ? (raw.accessory as RobotAccessory)
      : DEFAULT_PREFERENCES.accessory,
    personality: validPersonalities.includes(raw.personality as PersonalityStyle)
      ? (raw.personality as PersonalityStyle)
      : DEFAULT_PREFERENCES.personality,
    cloudGeminiEnabled: aiMode === 'auto' && raw.cloudGeminiEnabled !== false,
    aiMode,
    voiceOutputMode:
      raw.voiceOutputMode === 'gemini_tts' ||
      raw.voiceOutputMode === 'device_tts' ||
      raw.voiceOutputMode === 'muted'
        ? raw.voiceOutputMode
        : DEFAULT_PREFERENCES.voiceOutputMode,
    batterySaver: Boolean(raw.batterySaver),
    showFloatingOnStart:
      typeof raw.showFloatingOnStart === 'boolean'
        ? raw.showFloatingOnStart
        : DEFAULT_PREFERENCES.showFloatingOnStart,
    wakePhrasePrefixEnabled:
      typeof raw.wakePhrasePrefixEnabled === 'boolean'
        ? raw.wakePhrasePrefixEnabled
        : DEFAULT_PREFERENCES.wakePhrasePrefixEnabled,
    backgroundAssistantEnabled: Boolean(raw.backgroundAssistantEnabled),
    wakeWord: wakeCheck.valid ? wakeCheck.cleaned : resolvedName,
    wakeWordEnabled:
      typeof raw.wakeWordEnabled === 'boolean'
        ? raw.wakeWordEnabled
        : DEFAULT_PREFERENCES.wakeWordEnabled,
    wakeWordSensitivity: validSens.includes(raw.wakeWordSensitivity as WakeWordSensitivity)
      ? (raw.wakeWordSensitivity as WakeWordSensitivity)
      : DEFAULT_PREFERENCES.wakeWordSensitivity,
    confirmConsequentialActions:
      typeof raw.confirmConsequentialActions === 'boolean'
        ? raw.confirmConsequentialActions
        : DEFAULT_PREFERENCES.confirmConsequentialActions,
    floatingMode: validFloatingModes.includes(raw.floatingMode as FloatingMode)
      ? (raw.floatingMode as FloatingMode)
      : DEFAULT_PREFERENCES.floatingMode,
    floatingSize: validFloatingSizes.includes(raw.floatingSize as FloatingSize)
      ? (raw.floatingSize as FloatingSize)
      : DEFAULT_PREFERENCES.floatingSize,
    floatingOpacity: opacity,
    debugModeEnabled: Boolean(raw.debugModeEnabled),
  };
}
