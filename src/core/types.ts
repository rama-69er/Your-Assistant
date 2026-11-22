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

export type AIMode = 'auto' | 'offline_only';

export type WakeWordSensitivity = 'low' | 'balanced' | 'high';

export type FloatingMode = 'overlay' | 'bubble' | 'notification';

export type FloatingSize = 'small' | 'medium' | 'large';

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
  aiMode: AIMode;
  voiceOutputMode: VoiceOutputMode;
  batterySaver: boolean;
  showFloatingOnStart: boolean;
  wakePhrasePrefixEnabled: boolean;
  // Native Android & Background Assistant settings
  backgroundAssistantEnabled: boolean;
  wakeWord: string;
  wakeWordEnabled: boolean;
  wakeWordSensitivity: WakeWordSensitivity;
  confirmConsequentialActions: boolean;
  floatingMode: FloatingMode;
  floatingSize: FloatingSize;
  floatingOpacity: number; // 0.5 .. 1.0
  debugModeEnabled: boolean;
}

export type PermissionKey =
  | 'microphone'
  | 'camera'
  | 'photos'
  | 'notifications'
  | 'contacts'
  | 'overlay'
  | 'accessibility'
  | 'notification_listener'
  | 'battery_optimization';

export type PermissionStateValue =
  | 'granted'
  | 'denied'
  | 'prompt'
  | 'unsupported'
  | 'android_native_only';

export type PermissionStatusMap = Record<PermissionKey, PermissionStateValue>;

export type CommandCategory =
  | 'LOCAL_ANDROID_ACTION'
  | 'ACCESSIBILITY_UI'
  | 'APP_LAUNCH'
  | 'COMMUNICATION'
  | 'DEVICE_SETTING'
  | 'INFORMATION'
  | 'CLOUD_GEMINI'
  | 'UNSUPPORTED_RESTRICTED';

export type ShimiIntent =
  | 'OPEN_CAMERA'
  | 'TAKE_PHOTO_TIMER'
  | 'OPEN_YOUTUBE_SEARCH'
  | 'OPEN_MAPS_NAVIGATE'
  | 'OPEN_CHROME_SEARCH'
  | 'COMPOSE_MESSAGE'
  | 'CALL_CONTACT'
  | 'OPEN_CONTACTS'
  | 'OPEN_CALENDAR'
  | 'SET_REMINDER'
  | 'FIND_PHOTO'
  | 'READ_NOTIFICATIONS'
  | 'FLASHLIGHT_TOGGLE'
  | 'VOLUME_CONTROL'
  | 'MEDIA_CONTROL'
  | 'SET_TIMER'
  | 'SET_ALARM'
  | 'OPEN_APP'
  | 'OPEN_SETTINGS'
  | 'SCROLL_PAGE'
  | 'CLICK_UI_ELEMENT'
  | 'NAVIGATE_BACK'
  | 'GO_HOME'
  | 'OPEN_RECENTS'
  | 'LIST_CAPABILITIES'
  | 'CLARIFY'
  | 'CONVERSATION'
  | 'UNSUPPORTED_ANDROID_ACTION';

export type SettingsTarget =
  | 'general'
  | 'wifi'
  | 'bluetooth'
  | 'battery'
  | 'display'
  | 'accessibility'
  | 'notifications'
  | 'overlay'
  | 'app_details';

export interface ShimiActionParameters {
  query?: string;
  destination?: string;
  contact?: string;
  messageBody?: string;
  timerSeconds?: number;
  alarmHour?: number;
  alarmMinute?: number;
  alarmLabel?: string;
  direction?: 'up' | 'down';
  photoSubject?: string;
  appName?: string;
  packageName?: string;
  flashlightOn?: boolean;
  volumeAction?: 'up' | 'down' | 'mute' | 'unmute';
  mediaAction?: 'play_pause' | 'next' | 'previous';
  settingsTarget?: SettingsTarget;
  uiElementText?: string;
  reminderText?: string;
  reminderTime?: string;
}

export interface ShimiInterpretation {
  spokenReply: string;
  robotState: RobotState;
  intent: ShimiIntent;
  category: CommandCategory;
  parameters: ShimiActionParameters;
  requiresConfirmation: boolean;
  requiredPermission: PermissionKey | 'none';
  missingInfoQuestion?: string;
  source: 'gemini' | 'local' | 'native_android';
  requiresCloud?: boolean;
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
  category: CommandCategory;
  executor: 'local_android_native' | 'accessibility_native' | 'web_browser' | 'gemini_cloud';
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
  source?: 'gemini' | 'local' | 'native_android';
  timestamp: number;
}

export type ActiveTab = 'dashboard' | 'customize' | 'permissions' | 'privacy' | 'apk';

export type TaskStepType =
  | 'OPEN_APP'
  | 'WAIT_FOR_APP'
  | 'FIND_UI'
  | 'CLICK'
  | 'TYPE'
  | 'SCROLL'
  | 'CONFIRM'
  | 'VERIFY';

export type TaskStepStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'COMPLETED'
  | 'WAITING_CONFIRMATION'
  | 'FAILED'
  | 'CANCELLED';

export interface TaskStepItem {
  index: number;
  type: TaskStepType;
  description: string;
  target?: string;
  value?: string;
  requiresConfirmation?: boolean;
  status: TaskStepStatus;
}

export interface TaskPlanPreview {
  id: string;
  title: string;
  originalUtterance: string;
  targetAppName: string;
  requiresAccessibility: boolean;
  hasConfirmationGate: boolean;
  steps: TaskStepItem[];
}

export interface SelfTestCheckItem {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
  scope: 'native' | 'web';
}

export interface ApkBuildRequest {
  assistantName: string;
  wakeWord: string;
  robotStyle: RobotStyle;
  accessory: RobotAccessory;
  personality: PersonalityStyle;
  themeId: string;
  versionName: string;
}

export interface ApkReleaseInfo {
  tagName: string;
  versionName: string;
  fileName: string;
  downloadUrl: string;
  publishedAt: string;
  sizeBytes?: number;
  signed: boolean;
  releaseUrl: string;
}

export interface ApkWorkflowRun {
  id: number;
  status: 'queued' | 'in_progress' | 'completed' | string;
  conclusion: string | null;
  htmlUrl: string;
  createdAt: string;
  updatedAt: string;
  displayTitle?: string;
}

export interface ApkStatusResponse {
  ciConfigured: boolean;
  repo: string | null;
  branch: string;
  workflowFile: string;
  latestApk: ApkReleaseInfo | null;
  recentRuns: ApkWorkflowRun[];
  suggestedVersion: string;
  message?: string;
}

export interface ScopedPhotoItem {
  id: string;
  name: string;
  previewUrl: string;
  matched?: boolean;
  matchReason?: string;
}

export type DebugStage =
  | 'WAKE_WORD'
  | 'SPEECH'
  | 'INTENT'
  | 'EXECUTOR'
  | 'ANDROID_ACTION'
  | 'RESULT'
  | 'BRIDGE'
  | 'ERROR';

export interface DebugTraceEntry {
  id: string;
  timestamp: number;
  stage: DebugStage;
  summary: string;
  detail?: string;
  durationMs?: number;
  ok: boolean;
}

export interface InstalledAppInfo {
  label: string;
  packageName: string;
}

export interface NativeServiceSnapshot {
  connected: boolean;
  androidSdkInt?: number;
  serviceRunning: boolean;
  wakeWordActive: boolean;
  wakeWordProvider?: string;
  listening: boolean;
  speaking: boolean;
  overlayVisible: boolean;
  accessibilityConnected: boolean;
  notificationListenerConnected: boolean;
  batteryOptimizationIgnored: boolean;
  robotState: RobotState;
  lastRecognizedText?: string;
  lastResponseText?: string;
  permissions?: Partial<PermissionStatusMap>;
  installedAppsCount?: number;
}

export type NativeEventType =
  | 'WAKE_WORD_DETECTED'
  | 'LISTENING_STARTED'
  | 'SPEECH_PARTIAL'
  | 'SPEECH_FINAL'
  | 'COMMAND_EXECUTING'
  | 'ACTION_COMPLETED'
  | 'ACTION_FAILED'
  | 'CONFIRMATION_REQUIRED'
  | 'ASSISTANT_SPEAKING'
  | 'PERMISSION_MISSING'
  | 'SERVICE_STATE_CHANGED'
  | 'DEBUG_TRACE';

export interface NativeBridgeEvent {
  type: NativeEventType;
  timestamp: number;
  payload: Record<string, unknown>;
}
