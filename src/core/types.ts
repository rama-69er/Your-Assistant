export type RobotState =
  | 'IDLE'
  | 'LISTENING'
  | 'THINKING'
  | 'SPEAKING'
  | 'SUCCESS'
  | 'CONFUSED'
  | 'SORRY'
  | 'SLEEPING';

export type RobotStyle = 'pod' | 'aero' | 'deskbot';

export type RobotAccessory =
  | 'none'
  | 'halo'
  | 'beanie'
  | 'glasses'
  | 'headphones'
  | 'star';

export type PersonalityStyle = 'warm' | 'playful' | 'calm';

export type VoiceOutputMode = 'gemini_tts' | 'device_tts' | 'muted';

export interface RobotColorTheme {
  id: string;
  label: string;
  shell: string;
  shellShade: string;
  accent: string;
  visor: string;
  eyeGlow: string;
}

export interface AssistantPreferences {
  name: string;
  onboardingCompleted: boolean;
  themeId: string;
  robotStyle: RobotStyle;
  accessory: RobotAccessory;
  personality: PersonalityStyle;
  cloudGeminiEnabled: boolean;
  voiceOutputMode: VoiceOutputMode;
  batterySaver: boolean;
  showFloatingOnStart: boolean;
  wakePhrasePrefixEnabled: boolean;
}

export type PermissionKey =
  | 'microphone'
  | 'camera'
  | 'photos'
  | 'notifications'
  | 'overlay'
  | 'accessibility'
  | 'notification_listener';

export type PermissionStateValue =
  | 'granted'
  | 'denied'
  | 'prompt'
  | 'unsupported'
  | 'android_native_only';

export type PermissionStatusMap = Record<PermissionKey, PermissionStateValue>;

export type ShimiIntent =
  | 'OPEN_CAMERA'
  | 'TAKE_PHOTO_TIMER'
  | 'OPEN_YOUTUBE_SEARCH'
  | 'OPEN_MAPS_NAVIGATE'
  | 'COMPOSE_MESSAGE'
  | 'FIND_PHOTO'
  | 'READ_NOTIFICATIONS'
  | 'SCROLL_PAGE'
  | 'NAVIGATE_BACK'
  | 'GO_HOME'
  | 'LIST_CAPABILITIES'
  | 'CLARIFY'
  | 'CONVERSATION'
  | 'UNSUPPORTED_ANDROID_ACTION';

export interface ShimiActionParameters {
  query?: string;
  destination?: string;
  contact?: string;
  messageBody?: string;
  timerSeconds?: number;
  direction?: 'up' | 'down';
  photoSubject?: string;
  appName?: string;
}

export interface ShimiInterpretation {
  spokenReply: string;
  robotState: RobotState;
  intent: ShimiIntent;
  parameters: ShimiActionParameters;
  requiresConfirmation: boolean;
  requiredPermission: PermissionKey | 'none';
  missingInfoQuestion?: string;
  source: 'gemini' | 'local';
}

export type ActionExecutionStatus =
  | 'pending_confirmation'
  | 'executed'
  | 'blocked_permission'
  | 'unsupported_in_web'
  | 'cancelled'
  | 'error';

export interface ActionExecutionRecord {
  id: string;
  timestamp: number;
  userUtterance: string;
  intent: ShimiIntent;
  requiredPermission: PermissionKey | 'none';
  status: ActionExecutionStatus;
  summary: string;
  detail?: string;
  actionUrl?: string;
  actionUrlLabel?: string;
  parameters: ShimiActionParameters;
  requiresConfirmation: boolean;
}

export interface ConversationTurn {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  robotState?: RobotState;
  intent?: ShimiIntent;
  source?: 'gemini' | 'local';
  timestamp: number;
}

export type ActiveTab = 'dashboard' | 'customize' | 'permissions' | 'privacy';

export interface ScopedPhotoItem {
  id: string;
  name: string;
  previewUrl: string;
  matched?: boolean;
  matchReason?: string;
}
