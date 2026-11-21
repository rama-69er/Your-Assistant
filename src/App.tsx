import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Lock, Palette, Play, Shield, Sparkles, Square } from 'lucide-react';
import { CameraModal } from './components/CameraModal';
import { CustomizeView } from './components/CustomizeView';
import { DashboardView } from './components/DashboardView';
import { FloatingRobotOverlay } from './components/FloatingRobotOverlay';
import { OnboardingView } from './components/OnboardingView';
import { PermissionsView } from './components/PermissionsView';
import { PhotoPickerModal } from './components/PhotoPickerModal';
import { PrivacySettingsView } from './components/PrivacySettingsView';
import { OfflineIndicator } from './components/PWAInstallButton';
import { computeNextAutoState, DEFAULT_PREFERENCES } from './core/robotStateMachine';
import type {
  ActionExecutionRecord,
  ActiveTab,
  AssistantPreferences,
  ConversationTurn,
  DebugStage,
  DebugTraceEntry,
  NativeServiceSnapshot,
  PermissionKey,
  PermissionStatusMap,
  RobotState,
} from './core/types';
import { dispatchShimiAction } from './services/actionDispatcher';
import { fetchServerHealth, interpretCommand } from './services/geminiService';
import { nativeBridge } from './services/nativeBridge';
import {
  INITIAL_PERMISSION_STATUS,
  inspectDevicePermissions,
  requestRealPermission,
} from './services/permissionManager';
import {
  clearAllLocalPreferences,
  loadPreferences,
  savePreferences,
} from './services/preferencesStorage';
import {
  isBrowserSpeechRecognitionSupported,
  VoiceAssistantController,
} from './services/voiceAssistant';

function readAutostartParam(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('autostart') === '1';
}

export default function App() {
  const [preferences, setPreferences] = useState<AssistantPreferences>(() => {
    const stored = loadPreferences();
    if (readAutostartParam() && !stored.onboardingCompleted) {
      return { ...stored, onboardingCompleted: true };
    }
    return stored;
  });

  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [tabHistory, setTabHistory] = useState<ActiveTab[]>(['dashboard']);
  const [permissions, setPermissions] = useState<PermissionStatusMap>(INITIAL_PERMISSION_STATUS);
  const [geminiServerConfigured, setGeminiServerConfigured] = useState(true);
  const [nativeSnapshot, setNativeSnapshot] = useState<NativeServiceSnapshot>(() =>
    nativeBridge.getSnapshot()
  );

  // Ephemeral session state (never persisted across reloads)
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isFloatingVisible, setIsFloatingVisible] = useState(false);
  const [robotState, setRobotState] = useState<RobotState>('IDLE');
  const [audioLevel, setAudioLevel] = useState(0);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [latestBubble, setLatestBubble] = useState<string>(
    `Tap Start ${preferences.name} when you're ready to talk or issue a command.`
  );
  const [cloudError, setCloudError] = useState<string | null>(null);
  const [conversation, setConversation] = useState<ConversationTurn[]>([]);
  const [actionLog, setActionLog] = useState<ActionExecutionRecord[]>([]);
  const [debugTraces, setDebugTraces] = useState<DebugTraceEntry[]>([]);

  // Active interactive task modals
  const [cameraModal, setCameraModal] = useState<{ open: boolean; timerSeconds?: number }>({
    open: false,
  });
  const [photoModal, setPhotoModal] = useState<{ open: boolean; subject: string }>({
    open: false,
    subject: '',
  });

  const voiceControllerRef = useRef<VoiceAssistantController | null>(null);
  const lastActivityRef = useRef<number>(Date.now());
  const speechSupported = isBrowserSpeechRecognitionSupported();

  if (!voiceControllerRef.current) {
    voiceControllerRef.current = new VoiceAssistantController();
  }

  const pushDebugTrace = useCallback(
    (
      stage: DebugStage,
      summary: string,
      detail = '',
      ok = true,
      durationMs?: number
    ) => {
      const entry: DebugTraceEntry = {
        id: `dbg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        timestamp: Date.now(),
        stage,
        summary,
        detail,
        ok,
        durationMs,
      };
      setDebugTraces((prev) => [entry, ...prev.slice(0, 39)]);
    },
    []
  );

  const syncWithNativeSnapshot = useCallback(() => {
    const snap = nativeBridge.getSnapshot();
    setNativeSnapshot(snap);
    if (snap.connected) {
      setIsSessionActive(snap.serviceRunning);
      setIsListening(snap.listening);
      setIsFloatingVisible(snap.overlayVisible);
      setRobotState(snap.robotState);
      if (snap.lastResponseText) {
        setLatestBubble(snap.lastResponseText);
      }
    }
    inspectDevicePermissions().then(setPermissions);
  }, []);

  // Inspect real permissions, server health, and subscribe to native Android bridge events
  useEffect(() => {
    syncWithNativeSnapshot();
    fetchServerHealth().then((health) => setGeminiServerConfigured(health.geminiConfigured));

    const unsubscribe = nativeBridge.subscribe((event) => {
      const p = event.payload || {};
      switch (event.type) {
        case 'SERVICE_STATE_CHANGED': {
          const snap = nativeBridge.getSnapshot();
          setNativeSnapshot(snap);
          if (snap.connected) {
            setIsSessionActive(snap.serviceRunning);
            setIsListening(snap.listening);
            setRobotState(snap.robotState);
          }
          inspectDevicePermissions().then(setPermissions);
          pushDebugTrace(
            'BRIDGE',
            snap.serviceRunning ? 'Native foreground service running' : 'Native service idle',
            `Wake word active: ${snap.wakeWordActive ? 'yes' : 'no'} · Overlay: ${snap.overlayVisible ? 'visible' : 'hidden'}`,
            true
          );
          break;
        }
        case 'WAKE_WORD_DETECTED': {
          const word = String(p.wakeWord || preferences.wakeWord);
          setRobotState('LISTENING');
          setLatestBubble(`Heard "${word}" — listening for your command...`);
          pushDebugTrace(
            'WAKE_WORD',
            `Wake word "${word}" detected on device`,
            p.remainder ? `Inline command: "${String(p.remainder)}"` : 'Opened active listening window',
            true
          );
          break;
        }
        case 'LISTENING_STARTED':
          setIsListening(true);
          setRobotState('LISTENING');
          break;
        case 'SPEECH_PARTIAL':
          setInterimTranscript(String(p.transcript || ''));
          break;
        case 'SPEECH_FINAL': {
          const transcript = String(p.transcript || '');
          setIsListening(false);
          setInterimTranscript('');
          if (transcript) {
            pushDebugTrace('SPEECH', `Native SpeechRecognizer: "${transcript}"`, '', true);
          }
          break;
        }
        case 'ACTION_COMPLETED': {
          const spoken = String(p.spokenReply || p.message || '');
          const nextState = (String(p.robotState || 'SUCCESS') as RobotState) || 'SUCCESS';
          setIsListening(false);
          if (spoken) setLatestBubble(spoken);
          setRobotState(nextState);
          pushDebugTrace(
            'ANDROID_ACTION',
            `${String(p.intent || 'ACTION')} -> ${String(p.status || 'executed')}`,
            spoken,
            p.ok !== false
          );
          break;
        }
        case 'ACTION_FAILED': {
          const msg = String(p.message || 'Native action failed.');
          setIsListening(false);
          setLatestBubble(msg);
          setRobotState('SORRY');
          pushDebugTrace('ERROR', 'Native action failed', msg, false);
          break;
        }
        case 'DEBUG_TRACE': {
          const stage = (String(p.stage || 'BRIDGE') as DebugStage) || 'BRIDGE';
          const ok = p.ok !== false && p.status !== 'error' && p.status !== 'warn';
          pushDebugTrace(
            stage,
            String(p.summary || 'Native trace'),
            String(p.detail || ''),
            ok,
            typeof p.durationMs === 'number' ? p.durationMs : undefined
          );
          break;
        }
        default:
          break;
      }
    });

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        syncWithNativeSnapshot();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      unsubscribe();
      document.removeEventListener('visibilitychange', handleVisibility);
      voiceControllerRef.current?.releaseAll();
    };
  }, [preferences.wakeWord, pushDebugTrace, syncWithNativeSnapshot]);

  // Keep document title aligned with custom assistant name
  useEffect(() => {
    document.title = `${preferences.name} — Privacy-First Voice AI Assistant`;
  }, [preferences.name]);

  // Battery-conscious inactivity state settling
  useEffect(() => {
    const interval = window.setInterval(() => {
      const elapsed = Date.now() - lastActivityRef.current;
      setRobotState((current) =>
        computeNextAutoState(current, elapsed, isSessionActive && !isPaused, preferences.batterySaver)
      );
    }, 2500);
    return () => window.clearInterval(interval);
  }, [isSessionActive, isPaused, preferences.batterySaver]);

  const markActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
  }, []);

  const updatePreferences = useCallback((patch: Partial<AssistantPreferences>) => {
    setPreferences((prev) => {
      const next = { ...prev, ...patch };
      savePreferences(next);
      nativeBridge.syncPreferences(next);
      return next;
    });
  }, []);

  const navigateToTab = useCallback((nextTab: ActiveTab) => {
    setActiveTab(nextTab);
    setTabHistory((prev) => (prev[prev.length - 1] === nextTab ? prev : [...prev.slice(-6), nextTab]));
  }, []);

  const navigateBackTab = useCallback(() => {
    setTabHistory((prev) => {
      if (prev.length <= 1) {
        setActiveTab('dashboard');
        return ['dashboard'];
      }
      const nextHist = prev.slice(0, -1);
      setActiveTab(nextHist[nextHist.length - 1]);
      return nextHist;
    });
  }, []);

  const speakResponse = useCallback(
    async (text: string, settledState: RobotState) => {
      if (preferences.voiceOutputMode === 'muted') {
        setRobotState(settledState);
        return;
      }
      await voiceControllerRef.current?.speak({
        text,
        personality: preferences.personality,
        mode: preferences.voiceOutputMode,
        cloudGeminiEnabled:
          preferences.aiMode !== 'offline_only' && preferences.cloudGeminiEnabled,
        onSpeakingStart: () => {
          markActivity();
          setRobotState('SPEAKING');
        },
        onSpeakingEnd: () => {
          markActivity();
          setRobotState(settledState);
        },
      });
    },
    [
      markActivity,
      preferences.aiMode,
      preferences.cloudGeminiEnabled,
      preferences.personality,
      preferences.voiceOutputMode,
    ]
  );

  const handleCommand = useCallback(
    async (rawUtterance: string) => {
      const utterance = rawUtterance.trim();
      if (!utterance || isProcessing) return;

      markActivity();
      setIsProcessing(true);
      setCloudError(null);
      setInterimTranscript('');
      setRobotState('THINKING');
      setLatestBubble('Thinking...');
      pushDebugTrace('SPEECH', `Received command: "${utterance}"`, 'Entering offline-first router', true);

      const userTurn: ConversationTurn = {
        id: `usr_${Date.now()}`,
        role: 'user',
        text: utterance,
        timestamp: Date.now(),
      };
      setConversation((prev) => [...prev.slice(-11), userTurn]);

      try {
        const { interpretation, routedLocally, cloudError: errMsg, durationMs } =
          await interpretCommand({
            utterance,
            assistantName: preferences.name,
            wakeWord: preferences.wakeWord,
            personality: preferences.personality,
            permissions,
            aiMode: preferences.aiMode,
            cloudGeminiEnabled: preferences.cloudGeminiEnabled,
            confirmConsequentialActions: preferences.confirmConsequentialActions,
            recentContext: [...conversation, userTurn],
          });

        pushDebugTrace(
          'INTENT',
          `${interpretation.intent} (${interpretation.category})`,
          routedLocally
            ? 'Resolved locally offline (0 Gemini calls)'
            : `Resolved via ${interpretation.source}`,
          true,
          durationMs
        );

        if (errMsg) {
          setCloudError(errMsg);
          pushDebugTrace('INTENT', 'Cloud Gemini fallback triggered', errMsg, false);
        }

        const execStart = performance.now();
        const executionRecord = dispatchShimiAction(
          utterance,
          preferences.name,
          interpretation,
          permissions,
          {
            onOpenCamera: (timerSeconds) => {
              setCameraModal({ open: true, timerSeconds });
            },
            onOpenPhotoPicker: (subject) => {
              setPhotoModal({ open: true, subject });
            },
            onScrollPage: (direction) => {
              window.scrollBy({
                top: direction === 'down' ? 420 : -420,
                behavior: 'smooth',
              });
            },
            onNavigateBack: navigateBackTab,
            onGoHome: () => navigateToTab('dashboard'),
          }
        );
        const execMs = Math.round(performance.now() - execStart);

        const isNativeExecutor =
          executionRecord.executor === 'local_android_native' ||
          executionRecord.executor === 'accessibility_native';
        pushDebugTrace(
          isNativeExecutor ? 'ANDROID_ACTION' : 'EXECUTOR',
          `${executionRecord.intent} -> ${executionRecord.status}`,
          executionRecord.detail || executionRecord.summary,
          executionRecord.status === 'executed' || executionRecord.status === 'pending_confirmation',
          execMs
        );

        setActionLog((prev) => [executionRecord, ...prev.slice(0, 14)]);

        const finalRobotState: RobotState =
          executionRecord.status === 'blocked_permission' ||
          executionRecord.status === 'unsupported_in_web'
            ? 'SORRY'
            : executionRecord.status === 'error'
              ? 'CONFUSED'
              : interpretation.robotState;

        const replyText =
          executionRecord.status === 'unsupported_in_web' && executionRecord.detail
            ? executionRecord.detail
            : interpretation.spokenReply;

        const assistantTurn: ConversationTurn = {
          id: `ast_${Date.now()}`,
          role: 'assistant',
          text: replyText,
          robotState: finalRobotState,
          intent: interpretation.intent,
          source: interpretation.source,
          timestamp: Date.now(),
        };
        setConversation((prev) => [...prev.slice(-11), assistantTurn]);
        setLatestBubble(replyText);
        setRobotState(finalRobotState);

        pushDebugTrace('RESULT', `Robot state: ${finalRobotState}`, replyText, true);

        setIsProcessing(false);
        await speakResponse(replyText, finalRobotState);
      } catch (err) {
        setIsProcessing(false);
        setRobotState('SORRY');
        setLatestBubble('Something interrupted that command. Please try again.');
        pushDebugTrace(
          'ERROR',
          'Command execution error',
          err instanceof Error ? err.message : 'Unexpected failure',
          false
        );
      }
    },
    [
      conversation,
      isProcessing,
      markActivity,
      navigateBackTab,
      navigateToTab,
      permissions,
      preferences.aiMode,
      preferences.cloudGeminiEnabled,
      preferences.confirmConsequentialActions,
      preferences.name,
      preferences.personality,
      preferences.wakeWord,
      pushDebugTrace,
      speakResponse,
    ]
  );

  const startVoiceListening = useCallback(async () => {
    if (nativeBridge.isNativeAvailable()) {
      nativeBridge.startNativeListening();
      return;
    }
    if (!voiceControllerRef.current) return;
    markActivity();
    setIsPaused(false);
    setRobotState('LISTENING');
    setLatestBubble('Listening...');

    await voiceControllerRef.current.startListening({
      onInterimTranscript: (text) => {
        markActivity();
        setInterimTranscript(text);
      },
      onFinalTranscript: (text) => {
        setInterimTranscript('');
        handleCommand(text);
      },
      onAudioLevel: (lvl) => setAudioLevel(lvl),
      onListeningChange: (listening) => {
        setIsListening(listening);
        if (!listening) {
          setInterimTranscript('');
        }
      },
      onError: (code, msg) => {
        if (code === 'PERMISSION_DENIED') {
          setPermissions((prev) => ({ ...prev, microphone: 'denied' }));
        }
        setRobotState('SORRY');
        setLatestBubble(msg);
      },
    });
  }, [handleCommand, markActivity]);

  const handleStartSession = useCallback(() => {
    markActivity();
    setIsSessionActive(true);
    setIsPaused(false);
    setIsFloatingVisible(preferences.showFloatingOnStart);
    setRobotState('IDLE');
    if (nativeBridge.isNativeAvailable()) {
      nativeBridge.syncPreferences({ ...preferences, backgroundAssistantEnabled: true });
      nativeBridge.setBackgroundAssistantEnabled(true);
      syncWithNativeSnapshot();
    }
    setLatestBubble(
      `Hi! ${preferences.name} is active. Tap Speak Now or type a command below.`
    );
  }, [markActivity, preferences, syncWithNativeSnapshot]);

  const handleStopSession = useCallback(() => {
    voiceControllerRef.current?.releaseAll(setIsListening, setAudioLevel);
    if (nativeBridge.isNativeAvailable()) {
      nativeBridge.setBackgroundAssistantEnabled(false);
      syncWithNativeSnapshot();
    }
    updatePreferences({ backgroundAssistantEnabled: false });
    setIsSessionActive(false);
    setIsPaused(false);
    setIsFloatingVisible(false);
    setInterimTranscript('');
    setCameraModal({ open: false });
    setPhotoModal({ open: false, subject: '' });
    setRobotState('SLEEPING');
    setLatestBubble(
      `${preferences.name} stopped. Background listening, microphone, and overlay have been released.`
    );
  }, [preferences.name, syncWithNativeSnapshot, updatePreferences]);

  const handleToggleBackgroundAssistant = useCallback(
    (enabled: boolean) => {
      updatePreferences({ backgroundAssistantEnabled: enabled });
      if (enabled) {
        if (nativeBridge.isNativeAvailable()) {
          nativeBridge.syncPreferences({ ...preferences, backgroundAssistantEnabled: true });
          nativeBridge.setBackgroundAssistantEnabled(true);
          syncWithNativeSnapshot();
        }
        handleStartSession();
      } else {
        handleStopSession();
      }
    },
    [handleStartSession, handleStopSession, preferences, syncWithNativeSnapshot, updatePreferences]
  );

  const handleToggleListening = useCallback(() => {
    if (!isSessionActive) {
      handleStartSession();
      startVoiceListening();
      return;
    }
    if (isListening) {
      if (nativeBridge.isNativeAvailable()) {
        nativeBridge.stopNativeListening();
      } else {
        voiceControllerRef.current?.stopListening(setIsListening, setAudioLevel);
      }
      setRobotState('IDLE');
      setLatestBubble('Microphone paused. Tap Speak Now whenever you are ready.');
    } else {
      startVoiceListening();
    }
  }, [handleStartSession, isListening, isSessionActive, startVoiceListening]);

  const handleTogglePause = useCallback(() => {
    if (!isPaused) {
      voiceControllerRef.current?.stopListening(setIsListening, setAudioLevel);
      if (nativeBridge.isNativeAvailable()) {
        nativeBridge.stopNativeListening();
      }
      setIsPaused(true);
      setRobotState('SLEEPING');
      setLatestBubble(`${preferences.name} is paused. Microphone is off.`);
    } else {
      markActivity();
      setIsPaused(false);
      setRobotState('IDLE');
      setLatestBubble(`${preferences.name} resumed and ready.`);
    }
  }, [isPaused, markActivity, preferences.name]);

  const handleConfirmAction = useCallback(
    (actionId: string) => {
      markActivity();
      if (nativeBridge.isNativeAvailable()) {
        nativeBridge.confirmAction(actionId);
      }
      setActionLog((prev) =>
        prev.map((item) =>
          item.id === actionId
            ? {
                ...item,
                status: 'executed',
                summary: item.summary.replace(/^Confirm\s+/i, 'Confirmed: '),
                detail: nativeBridge.isNativeAvailable()
                  ? 'Confirmed by you and handed to Android.'
                  : 'Confirmed by you. Tap the button below to open the prepared app draft.',
              }
            : item
        )
      );
      pushDebugTrace('RESULT', 'User confirmed consequential action', actionId, true);
      setRobotState('SUCCESS');
      setLatestBubble('Confirmed! Proceeding with your action.');
    },
    [markActivity, pushDebugTrace]
  );

  const handleCancelAction = useCallback(
    (actionId: string) => {
      markActivity();
      if (nativeBridge.isNativeAvailable()) {
        nativeBridge.cancelAction(actionId);
      }
      setActionLog((prev) =>
        prev.map((item) =>
          item.id === actionId
            ? {
                ...item,
                status: 'cancelled',
                detail: 'Cancelled before sending or calling anything.',
              }
            : item
        )
      );
      pushDebugTrace('RESULT', 'User cancelled consequential action', actionId, true);
      setRobotState('IDLE');
      setLatestBubble('Okay, I cancelled that action. Nothing was sent.');
    },
    [markActivity, pushDebugTrace]
  );

  const handleRequestPermission = useCallback(async (key: PermissionKey): Promise<string> => {
    const result = await requestRealPermission(key);
    setPermissions((prev) => ({ ...prev, [key]: result.state }));
    return result.message;
  }, []);

  const handleOpenNativeSettings = useCallback((key: PermissionKey) => {
    if (key === 'battery_optimization') {
      nativeBridge.requestBatteryOptimizationExemption();
      return;
    }
    const targetMap: Record<PermissionKey, 'general' | 'overlay' | 'accessibility' | 'notifications' | 'app_details'> = {
      microphone: 'app_details',
      camera: 'app_details',
      photos: 'app_details',
      contacts: 'app_details',
      notifications: 'notifications',
      overlay: 'overlay',
      accessibility: 'accessibility',
      notification_listener: 'notifications',
      battery_optimization: 'general',
    };
    nativeBridge.openAndroidSetting(targetMap[key]);
  }, []);

  const handleClearAllAndReset = useCallback(() => {
    handleStopSession();
    clearAllLocalPreferences();
    setConversation([]);
    setActionLog([]);
    setDebugTraces([]);
    setCloudError(null);
    setPreferences({ ...DEFAULT_PREFERENCES });
    setActiveTab('dashboard');
    setRobotState('IDLE');
  }, [handleStopSession]);

  // First-time onboarding experience
  if (!preferences.onboardingCompleted) {
    return (
      <OnboardingView
        initialPreferences={preferences}
        onComplete={(nextPrefs) => {
          const normalized = { ...nextPrefs, wakeWord: nextPrefs.wakeWord || nextPrefs.name };
          savePreferences(normalized);
          nativeBridge.syncPreferences(normalized);
          setPreferences(normalized);
          setLatestBubble(
            `Hi! I'm ${normalized.name}. Tap Start ${normalized.name} whenever you'd like help.`
          );
        }}
      />
    );
  }

  const navItems: { id: ActiveTab; label: string; icon: React.ReactNode }[] = [
    { id: 'dashboard', label: 'Assistant', icon: <Sparkles className="w-5 h-5" /> },
    { id: 'customize', label: 'Customize', icon: <Palette className="w-5 h-5" /> },
    { id: 'permissions', label: 'Permissions', icon: <Shield className="w-5 h-5" /> },
    { id: 'privacy', label: 'Privacy', icon: <Lock className="w-5 h-5" /> },
  ];

  return (
    <div
      className="min-h-screen bg-[#F7F8FA] text-[#111827] pb-20 md:pb-12"
      data-session-active={isSessionActive ? 'true' : 'false'}
    >
      {/* Top Bar — Strict 3-Zone Contract */}
      <header className="sticky top-0 z-30 h-[52px] md:h-16 bg-white/90 backdrop-blur-md border-b border-slate-200/80">
        <div className="mx-auto flex h-full max-w-6xl items-center justify-between gap-8 px-4 md:px-6">
          {/* Zone 1: Single text element wordmark */}
          <button
            type="button"
            onClick={() => navigateToTab('dashboard')}
            className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 cursor-pointer"
          >
            {preferences.name}
          </button>

          {/* Zone 2: 4 clean single-line text navigation links */}
          <nav
            aria-label="Primary navigation"
            className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600"
          >
            {navItems.map((item) => {
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => navigateToTab(item.id)}
                  aria-current={active ? 'page' : undefined}
                  className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer border-b-2 ${
                    active
                      ? 'border-slate-900 text-slate-900 font-semibold'
                      : 'border-transparent hover:text-slate-900'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: 1 primary action */}
          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={isSessionActive ? handleStopSession : handleStartSession}
              className={`min-h-[38px] rounded-xl px-4 py-2 text-xs font-semibold transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
                isSessionActive
                  ? 'bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100'
                  : 'bg-slate-900 text-white hover:bg-slate-800'
              }`}
            >
              {isSessionActive ? (
                <>
                  <Square className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
                  <span>Stop {preferences.name}</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
                  <span>Start {preferences.name}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="mx-auto max-w-6xl px-4 py-6 md:px-6 md:py-8">
        {activeTab === 'dashboard' && (
          <DashboardView
            preferences={preferences}
            isSessionActive={isSessionActive}
            isPaused={isPaused}
            isListening={isListening}
            isProcessing={isProcessing}
            isFloatingVisible={isFloatingVisible}
            robotState={robotState}
            audioLevel={audioLevel}
            interimTranscript={interimTranscript}
            latestBubble={latestBubble}
            cloudError={cloudError}
            speechSupported={speechSupported}
            conversation={conversation}
            actionLog={actionLog}
            nativeSnapshot={nativeSnapshot}
            debugTraces={debugTraces}
            onClearDebugTraces={() => setDebugTraces([])}
            onStartSession={handleStartSession}
            onStopSession={handleStopSession}
            onTogglePause={handleTogglePause}
            onToggleListening={handleToggleListening}
            onShowFloating={() => {
              setIsFloatingVisible(true);
            }}
            onPreviewState={(st) => {
              markActivity();
              setRobotState(st);
            }}
            onSubmitCommand={handleCommand}
            onConfirmAction={handleConfirmAction}
            onCancelAction={handleCancelAction}
            onQuickOpenCamera={() => setCameraModal({ open: true })}
            onQuickOpenPhotos={() => setPhotoModal({ open: true, subject: 'Lucky' })}
          />
        )}

        {activeTab === 'customize' && (
          <CustomizeView preferences={preferences} onUpdate={updatePreferences} />
        )}

        {activeTab === 'permissions' && (
          <PermissionsView
            assistantName={preferences.name}
            permissions={permissions}
            nativeConnected={nativeSnapshot.connected}
            onRequestPermission={handleRequestPermission}
            onOpenNativeSettings={handleOpenNativeSettings}
            onRefreshPermissions={async () => {
              syncWithNativeSnapshot();
            }}
          />
        )}

        {activeTab === 'privacy' && (
          <PrivacySettingsView
            preferences={preferences}
            permissions={permissions}
            nativeSnapshot={nativeSnapshot}
            isSessionActive={isSessionActive}
            geminiServerConfigured={geminiServerConfigured}
            onUpdatePreferences={updatePreferences}
            onToggleBackgroundAssistant={handleToggleBackgroundAssistant}
            onStopSession={handleStopSession}
            onClearAllAndReset={handleClearAllAndReset}
          />
        )}
      </main>

      {/* Mobile Fixed Bottom Tab Bar (60px height; total sticky 112px <= 15% of 844px) */}
      <nav
        aria-label="Mobile navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 h-[60px] bg-white/95 backdrop-blur-md border-t border-slate-200 grid grid-cols-4 items-center"
      >
        {navItems.map((item) => {
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => navigateToTab(item.id)}
              aria-current={active ? 'page' : undefined}
              className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 transition-colors ${
                active ? 'text-blue-600' : 'text-slate-500'
              }`}
            >
              {item.icon}
              <span className="text-[10px] font-medium tracking-tight">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Draggable Floating Robot Companion */}
      {isSessionActive && isFloatingVisible && (
        <FloatingRobotOverlay
          preferences={preferences}
          robotState={robotState}
          isListening={isListening}
          isPaused={isPaused}
          audioLevel={audioLevel}
          latestBubble={latestBubble}
          onToggleListening={handleToggleListening}
          onTogglePause={handleTogglePause}
          onHide={() => {
            setIsFloatingVisible(false);
          }}
          onOpenMain={() => navigateToTab('dashboard')}
          onStopAssistant={handleStopSession}
        />
      )}

      {/* Real Camera & Scoped Photo Picker Modals */}
      <CameraModal
        open={cameraModal.open}
        initialCountdownSeconds={cameraModal.timerSeconds}
        assistantName={preferences.name}
        onClose={() => setCameraModal({ open: false })}
        onPermissionResult={(st) => setPermissions((prev) => ({ ...prev, camera: st }))}
        onPhotoCaptured={() => {
          markActivity();
          setRobotState('SUCCESS');
          setLatestBubble('Captured a temporary photo! Save it to your device or discard it.');
        }}
      />

      <PhotoPickerModal
        open={photoModal.open}
        initialSubject={photoModal.subject}
        cloudGeminiEnabled={
          preferences.aiMode !== 'offline_only' && preferences.cloudGeminiEnabled
        }
        onClose={() => setPhotoModal({ open: false, subject: '' })}
      />

      <OfflineIndicator />
    </div>
  );
}
