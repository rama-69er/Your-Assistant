import React, { useState } from 'react';
import {
  Camera,
  Check,
  ExternalLink,
  Eye,
  Image as ImageIcon,
  Mic,
  MicOff,
  Pause,
  Play,
  Send,
  ShieldAlert,
  Square,
  X,
} from 'lucide-react';
import { RobotCharacter } from './RobotCharacter';
import { ALL_ROBOT_STATES, ROBOT_STATE_META } from '../core/robotStateMachine';
import type {
  ActionExecutionRecord,
  AssistantPreferences,
  ConversationTurn,
  RobotState,
} from '../core/types';

interface DashboardViewProps {
  preferences: AssistantPreferences;
  isSessionActive: boolean;
  isPaused: boolean;
  isListening: boolean;
  isProcessing: boolean;
  isFloatingVisible: boolean;
  robotState: RobotState;
  audioLevel: number;
  interimTranscript: string;
  latestBubble: string;
  cloudError: string | null;
  speechSupported: boolean;
  conversation: ConversationTurn[];
  actionLog: ActionExecutionRecord[];
  onStartSession: () => void;
  onStopSession: () => void;
  onTogglePause: () => void;
  onToggleListening: () => void;
  onShowFloating: () => void;
  onPreviewState: (state: RobotState) => void;
  onSubmitCommand: (text: string) => void;
  onConfirmAction: (actionId: string) => void;
  onCancelAction: (actionId: string) => void;
  onQuickOpenCamera: () => void;
  onQuickOpenPhotos: () => void;
}

const EXAMPLE_COMMANDS = [
  'Open my camera',
  'Take a picture after five seconds',
  'Open YouTube and search for relaxing music',
  'Open Maps and navigate to Central Park',
  'Open WhatsApp and send a message to Alex saying see you soon',
  'Find a picture of Lucky in my gallery',
  'Read my latest notification',
  'What can you do?',
];

function getStatusLabel(status: ActionExecutionRecord['status']): {
  text: string;
  tone: string;
} {
  switch (status) {
    case 'executed':
      return { text: 'Verified', tone: 'text-emerald-700' };
    case 'pending_confirmation':
      return { text: 'Needs your confirmation', tone: 'text-amber-700' };
    case 'blocked_permission':
      return { text: 'Permission required', tone: 'text-rose-700' };
    case 'unsupported_in_web':
      return { text: 'Native Android limit', tone: 'text-slate-600' };
    case 'cancelled':
      return { text: 'Cancelled by you', tone: 'text-slate-500' };
    case 'error':
    default:
      return { text: 'Needs clarification', tone: 'text-amber-700' };
  }
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  preferences,
  isSessionActive,
  isPaused,
  isListening,
  isProcessing,
  isFloatingVisible,
  robotState,
  audioLevel,
  interimTranscript,
  latestBubble,
  cloudError,
  speechSupported,
  conversation,
  actionLog,
  onStartSession,
  onStopSession,
  onTogglePause,
  onToggleListening,
  onShowFloating,
  onPreviewState,
  onSubmitCommand,
  onConfirmAction,
  onCancelAction,
  onQuickOpenCamera,
  onQuickOpenPhotos,
}) => {
  const [commandInput, setCommandInput] = useState('');

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = commandInput.trim();
    if (!trimmed) return;
    setCommandInput('');
    onSubmitCommand(trimmed);
  };

  const stateMeta = ROBOT_STATE_META[robotState];

  return (
    <div className="space-y-8">
      {/* Main Hero Grid: Companion Stage + Voice & Conversation Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Left Column: Live Animated Shimi Robot & Session Controls */}
        <section
          aria-label={`${preferences.name} companion stage`}
          className="lg:col-span-5 rounded-3xl bg-white p-6 md:p-7 shadow-sm border border-slate-200/80 flex flex-col justify-between"
        >
          <div>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                  {preferences.name}
                </h1>
                <p className="mt-0.5 text-xs text-slate-500">
                  {isSessionActive
                    ? isPaused
                      ? 'Session paused · Microphone off'
                      : isListening
                        ? 'Session active · Microphone listening'
                        : 'Session active · Tap microphone or type'
                    : 'Assistant stopped · Microphone off'}
                </p>
              </div>
              <span className="text-xs font-medium text-slate-600 whitespace-nowrap">
                {stateMeta.label}
              </span>
            </div>

            {/* Speech Bubble */}
            <div
              role="status"
              aria-live="polite"
              data-testid="shimi-speech-bubble"
              className="mt-5 rounded-2xl bg-slate-50 px-4 py-3.5 text-sm text-slate-800 border border-slate-200/70 min-h-[68px] flex items-center"
            >
              <p className="leading-relaxed">
                {interimTranscript
                  ? `Hearing: "${interimTranscript}"`
                  : latestBubble}
              </p>
            </div>

            {/* Large Animated Robot Preview */}
            <div className="my-5 flex flex-col items-center justify-center">
              <RobotCharacter
                state={robotState}
                themeId={preferences.themeId}
                robotStyle={preferences.robotStyle}
                accessory={preferences.accessory}
                audioLevel={audioLevel}
                size={220}
                batterySaver={preferences.batterySaver}
                onClick={isSessionActive ? onToggleListening : onStartSession}
                ariaLabel={
                  isSessionActive
                    ? `Tap ${preferences.name} to start or stop listening`
                    : `Tap ${preferences.name} to start assistant`
                }
              />
              <p className="mt-2 text-xs text-slate-500 text-center">
                {stateMeta.description}
              </p>
            </div>
          </div>

          {/* Primary Start / Stop CTA & Session Controls */}
          <div className="space-y-3 pt-2 border-t border-slate-100">
            {!isSessionActive ? (
              <button
                type="button"
                onClick={onStartSession}
                className="w-full min-h-[48px] rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800 transition-colors inline-flex items-center justify-center gap-2 cursor-pointer"
              >
                <Play className="w-4 h-4 fill-current" aria-hidden="true" />
                <span>Start {preferences.name}</span>
              </button>
            ) : (
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={onToggleListening}
                  disabled={isPaused}
                  className={`min-h-[48px] rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 ${
                    isListening
                      ? 'bg-blue-600 text-white hover:bg-blue-700'
                      : 'bg-slate-900 text-white hover:bg-slate-800'
                  }`}
                >
                  {isListening ? (
                    <>
                      <MicOff className="w-4 h-4" aria-hidden="true" />
                      <span>Stop Mic</span>
                    </>
                  ) : (
                    <>
                      <Mic className="w-4 h-4" aria-hidden="true" />
                      <span>Speak Now</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={onStopSession}
                  className="min-h-[48px] rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700 hover:bg-rose-100 transition-colors inline-flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Square className="w-4 h-4 fill-current" aria-hidden="true" />
                  <span>Stop {preferences.name}</span>
                </button>
              </div>
            )}

            {isSessionActive && (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={onTogglePause}
                  className="min-h-[40px] rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5"
                >
                  {isPaused ? (
                    <>
                      <Play className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Resume Listening</span>
                    </>
                  ) : (
                    <>
                      <Pause className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Pause Listening</span>
                    </>
                  )}
                </button>

                {!isFloatingVisible && (
                  <button
                    type="button"
                    onClick={onShowFloating}
                    className="min-h-[40px] rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5"
                  >
                    <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Show Floating Robot</span>
                  </button>
                )}
              </div>
            )}

            {/* Quick Expression State Switcher */}
            <div className="pt-2">
              <p className="text-xs font-medium text-slate-500 mb-2">
                Preview character expressions
              </p>
              <div className="grid grid-cols-4 gap-1.5">
                {ALL_ROBOT_STATES.map((st) => {
                  const active = robotState === st;
                  return (
                    <button
                      key={st}
                      type="button"
                      onClick={() => onPreviewState(st)}
                      className={`min-h-[34px] rounded-lg px-2 py-1 text-[11px] font-medium transition-colors whitespace-nowrap truncate ${
                        active
                          ? 'bg-slate-900 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {st.charAt(0) + st.slice(1).toLowerCase()}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* Right Column: Command Console, Conversation & Verified Action Pipeline */}
        <section
          aria-label="Voice and command console"
          className="lg:col-span-7 rounded-3xl bg-white p-6 md:p-7 shadow-sm border border-slate-200/80 flex flex-col justify-between gap-6"
        >
          <div className="space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-slate-900">Voice &amp; Action Console</h2>
                <p className="text-xs text-slate-500">
                  {preferences.cloudGeminiEnabled
                    ? 'Cloud Gemini enabled · Ephemeral session'
                    : 'Local on-device mode · Zero cloud data'}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={onQuickOpenCamera}
                  className="min-h-[38px] rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5 whitespace-nowrap"
                >
                  <Camera className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Camera</span>
                </button>
                <button
                  type="button"
                  onClick={onQuickOpenPhotos}
                  className="min-h-[38px] rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5 whitespace-nowrap"
                >
                  <ImageIcon className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Photo Picker</span>
                </button>
              </div>
            </div>

            {cloudError && (
              <div
                role="alert"
                className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-xs text-amber-900 flex items-start gap-2.5"
              >
                <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" aria-hidden="true" />
                <span>
                  Cloud Gemini note: {cloudError} Using local command parsing as a fallback.
                </span>
              </div>
            )}

            {/* Ephemeral Conversation Bubbles */}
            <div
              className="space-y-3 max-h-[270px] overflow-y-auto pr-1"
              aria-label="Current session conversation"
            >
              {conversation.length === 0 ? (
                <div className="rounded-2xl bg-slate-50 p-5 border border-slate-200/70">
                  <p className="text-sm font-medium text-slate-900">
                    Try speaking or tapping a command below
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {speechSupported
                      ? `Tap Start ${preferences.name} or type below. Address your assistant naturally (e.g. "Hey ${preferences.name}, open my camera").`
                      : 'Speech recognition is unavailable in this browser; type any command below or click an example.'}
                  </p>
                </div>
              ) : (
                conversation.map((turn) => (
                  <div
                    key={turn.id}
                    className={`flex ${turn.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                        turn.role === 'user'
                          ? 'bg-slate-900 text-white'
                          : 'bg-slate-100 text-slate-900'
                      }`}
                    >
                      <p>{turn.text}</p>
                      {turn.role === 'assistant' && turn.source && (
                        <p className="mt-1 text-[11px] text-slate-500">
                          {preferences.name} · {turn.source === 'gemini' ? 'Gemini' : 'Local'}
                        </p>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Verified Action Pipeline Cards */}
            {actionLog.length > 0 && (
              <div className="space-y-2.5 pt-2 border-t border-slate-100">
                <h3 className="text-xs font-semibold text-slate-700">
                  Verified Actions This Session
                </h3>
                <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                  {actionLog.slice(0, 5).map((record) => {
                    const statusInfo = getStatusLabel(record.status);
                    return (
                      <div
                        key={record.id}
                        data-testid={`action-record-${record.intent}`}
                        className="rounded-2xl bg-slate-50 p-3.5 border border-slate-200/80 text-xs"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-semibold text-slate-900">{record.summary}</span>
                          <span className={`font-medium ${statusInfo.tone}`}>
                            {statusInfo.text}
                          </span>
                        </div>
                        {record.detail && (
                          <p className="mt-1 text-slate-600 leading-relaxed">{record.detail}</p>
                        )}
                        <p className="mt-1.5 text-[11px] text-slate-500">
                          Permission: {record.requiredPermission === 'none' ? 'None required' : record.requiredPermission}
                        </p>

                        {record.status === 'pending_confirmation' && (
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => onConfirmAction(record.id)}
                              className="min-h-[36px] rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 inline-flex items-center gap-1.5"
                            >
                              <Check className="w-3.5 h-3.5" aria-hidden="true" />
                              Confirm &amp; Prepare Link
                            </button>
                            <button
                              type="button"
                              onClick={() => onCancelAction(record.id)}
                              className="min-h-[36px] rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 inline-flex items-center gap-1.5"
                            >
                              <X className="w-3.5 h-3.5" aria-hidden="true" />
                              Cancel
                            </button>
                          </div>
                        )}

                        {record.status === 'executed' && record.actionUrl && (
                          <div className="mt-2.5">
                            <a
                              href={record.actionUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition-colors"
                            >
                              <span>{record.actionUrlLabel || 'Open Action'}</span>
                              <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                            </a>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Input Bar + Quick Voice Examples */}
          <div className="space-y-3 pt-3 border-t border-slate-100">
            <form onSubmit={handleFormSubmit} className="flex items-center gap-2">
              <label htmlFor="shimi-command-input" className="sr-only">
                Type a command for {preferences.name}
              </label>
              <input
                id="shimi-command-input"
                type="text"
                value={commandInput}
                onChange={(e) => setCommandInput(e.target.value)}
                placeholder={`Ask ${preferences.name} anything or give a phone command...`}
                className="flex-1 h-12 rounded-xl border border-slate-300 bg-white px-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
              />
              <button
                type="button"
                onClick={onToggleListening}
                aria-label={isListening ? 'Stop voice input' : 'Start voice input'}
                className={`min-h-[48px] min-w-[48px] rounded-xl flex items-center justify-center transition-colors ${
                  isListening
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </button>
              <button
                type="submit"
                disabled={!commandInput.trim() || isProcessing}
                aria-label="Send command"
                className="min-h-[48px] rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-40 inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                <Send className="w-4 h-4" aria-hidden="true" />
                <span className="hidden sm:inline">{isProcessing ? 'Thinking...' : 'Send'}</span>
              </button>
            </form>

            <div>
              <p className="text-xs text-slate-500 mb-2">Quick commands to test</p>
              <div className="flex flex-wrap gap-1.5">
                {EXAMPLE_COMMANDS.map((cmd) => (
                  <button
                    key={cmd}
                    type="button"
                    disabled={isProcessing}
                    onClick={() => onSubmitCommand(cmd)}
                    className="min-h-[34px] rounded-lg bg-slate-100 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-200 disabled:opacity-50 transition-colors text-left"
                  >
                    {cmd}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
